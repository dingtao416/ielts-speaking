import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { readAuthenticatedActor } from "@/application/authentication";
import { readStageState } from "@/application/stage-reader";
import { getDatabase } from "@/persistence/database";
import {
  practiceSessions,
  questionDeliveries,
  responseAttempts,
  responseFeedback,
  type VocabularyHighlight,
} from "@/persistence/schema";
import { chatComplete, chatCompleteStream, getLlmConfig, parseJsonFromLlm } from "@/lib/llm";
import { getV1FeedbackPrompt, getV1RewritePrompt } from "@/lib/prompts";
import { FEEDBACK_SCHEMA_VERSION, v1FeedbackSchema } from "@/lib/feedback-schemas";

export const runtime = "nodejs";

const FEEDBACK_VERSION = "v1";
// deepseek-v4-pro 为推理模型：思维链先消耗 tokens，输出上限需显著放大
const REWRITE_MAX_TOKENS = 2048;
const VOCAB_MAX_TOKENS = 2048;

/**
 * V1 单题反馈（FR-006/FR-007，两种模式共用）：
 * 1. 词汇建议：LLM 结构化输出（≤3 项），服务端 zod schema 校验
 * 2. 自然改写：保留原意的阶段匹配改写，SSE 流式输出
 * 3. 回答已保存（POST /api/response-attempts），本接口失败只置 degraded，可重试，不重复建答
 *
 * SSE 事件：
 *   data: {"type":"meta","vocabularyHighlights":[...],"activeStageBand":6.5,"status":"pending"}
 *   data: {"type":"text","text":"..."}
 *   data: {"type":"done","status":"ok"}
 *   data: {"type":"error","message":"..."}（status=degraded）
 */
export async function POST(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    attemptId?: string;
  } | null;
  const attemptId = body?.attemptId;
  if (!attemptId || typeof attemptId !== "string") {
    return Response.json({ error: "attemptId is required" }, { status: 400 });
  }

  const db = getDatabase().db;

  // 资源归属：attempt -> session -> user
  const [attempt] = await db
    .select()
    .from(responseAttempts)
    .where(
      and(
        eq(responseAttempts.id, attemptId),
        eq(responseAttempts.userId, actor.userId),
      ),
    )
    .limit(1);
  if (!attempt) {
    return Response.json({ error: "attempt not found" }, { status: 404 });
  }

  const [delivery] = await db
    .select()
    .from(questionDeliveries)
    .where(eq(questionDeliveries.id, attempt.questionDeliveryId))
    .limit(1);
  const [session] = await db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.id, attempt.sessionId))
    .limit(1);
  if (!delivery || !session) {
    return Response.json({ error: "session context missing" }, { status: 500 });
  }

  const topic = delivery.topic;
  const question = delivery.textSnapshot;
  const transcript = attempt.finalTranscript;

  if (!transcript.trim() || attempt.endedBy === "skipped") {
    return Response.json(
      { error: "no transcript to give feedback on" },
      { status: 400 },
    );
  }

  const stage = await readStageState(actor.userId);
  const activeStageBand = stage.activeStageBand;

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, payload: unknown) =>
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
    );

  const stream = new ReadableStream({
    async start(controller) {
      const markError = async (message: string) => {
        try {
          await db
            .update(responseFeedback)
            .set({ status: "degraded", updatedAt: new Date() })
            .where(eq(responseFeedback.responseAttemptId, attemptId));
        } catch {
          /* 降级标记失败不影响响应 */
        }
        send(controller, { type: "error", message });
        controller.close();
      };

      try {
        // 已有 ok 反馈 → 直接返回缓存（重试/回看不重复调用 LLM）
        const [existing] = await db
          .select()
          .from(responseFeedback)
          .where(eq(responseFeedback.responseAttemptId, attemptId))
          .limit(1);

        if (existing?.status === "ok") {
          send(controller, {
            type: "meta",
            vocabularyHighlights: existing.vocabularyHighlights,
            activeStageBand: existing.activeStageBand
              ? Number(existing.activeStageBand)
              : activeStageBand,
            status: "ok",
          });
          if (existing.naturalRewrite) {
            send(controller, { type: "text", text: existing.naturalRewrite });
          }
          send(controller, { type: "done", status: "ok" });
          controller.close();
          return;
        }

        // 首建反馈行（pending）；同 attempt 重试复用同一行
        if (!existing) {
          await db.insert(responseFeedback).values({
            id: randomUUID(),
            responseAttemptId: attemptId,
            activeStageBand: String(activeStageBand),
            vocabularyHighlights: [],
            naturalRewrite: null,
            status: "pending",
            feedbackVersion: FEEDBACK_VERSION,
            schemaVersion: FEEDBACK_SCHEMA_VERSION,
            modelVersion: getLlmConfig().model || null,
          });
        }

        // 1) 词汇建议（结构化 + schema 校验）
        const vocabPrompt = getV1FeedbackPrompt({
          topic,
          question,
          transcript,
          stageBand: activeStageBand,
        });
        const vocabContent = await chatComplete(
          [
            { role: "system", content: vocabPrompt.system },
            { role: "user", content: vocabPrompt.user },
          ],
          { maxTokens: VOCAB_MAX_TOKENS, temperature: 0.3 },
        );
        const parsedVocab = parseJsonFromLlm<{
          vocabularyHighlights?: unknown;
        }>(vocabContent);
        const vocabResult = v1FeedbackSchema
          .pick({ vocabularyHighlights: true })
          .safeParse({
            vocabularyHighlights: parsedVocab?.vocabularyHighlights,
          });

        let highlights: VocabularyHighlight[] = [];
        if (vocabResult.success) {
          highlights = vocabResult.data.vocabularyHighlights.map((h) => ({
            original: h.original,
            suggestion: h.suggestion,
            note: h.note ?? "",
          }));
        } else {
          // 词汇建议校验失败 → 按降级处理（保留空建议，改写仍继续）
          highlights = [];
        }

        await db
          .update(responseFeedback)
          .set({ vocabularyHighlights: highlights, updatedAt: new Date() })
          .where(eq(responseFeedback.responseAttemptId, attemptId));

        send(controller, {
          type: "meta",
          vocabularyHighlights: highlights,
          activeStageBand,
          status: "pending",
        });

        // 2) 自然改写（SSE 流式）
        const rewritePrompt = getV1RewritePrompt({
          topic,
          question,
          transcript,
          stageBand: activeStageBand,
        });
        let rewrite = "";
        try {
          await chatCompleteStream(
            [
              { role: "system", content: rewritePrompt.system },
              { role: "user", content: rewritePrompt.user },
            ],
            {
              maxTokens: REWRITE_MAX_TOKENS,
              temperature: 0.4,
              onChunk: (delta) => {
                rewrite += delta;
                send(controller, { type: "text", text: delta });
              },
            },
          );
        } catch (err: unknown) {
          await markError(
            err instanceof Error ? err.message : "rewrite stream failed",
          );
          return;
        }

        rewrite = rewrite.trim();
        if (!rewrite) {
          await markError("rewrite generation failed");
          return;
        }

        await db
          .update(responseFeedback)
          .set({
            naturalRewrite: rewrite.slice(0, 2000),
            status: "ok",
            updatedAt: new Date(),
          })
          .where(eq(responseFeedback.responseAttemptId, attemptId));

        send(controller, { type: "done", status: "ok" });
        controller.close();
      } catch (err: unknown) {
        await markError(
          err instanceof Error ? err.message : "feedback failed",
        );
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
