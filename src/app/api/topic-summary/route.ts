import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";

import { readAuthenticatedActor } from "@/application/authentication";
import { readStageState } from "@/application/stage-reader";
import { getDatabase } from "@/persistence/database";
import {
  practiceSessions,
  questionDeliveries,
  responseAttempts,
  responseFeedback,
  type SessionSummary,
} from "@/persistence/schema";
import { chatComplete, parseJsonFromLlm } from "@/lib/llm";
import { getTopicSummaryPrompt } from "@/lib/prompts";
import { topicSummarySchema } from "@/lib/feedback-schemas";

export const runtime = "nodejs";

/**
 * V1 标准话题总结（D-3 已确认：显示"训练用途预估"）：
 * - 输入 practice_session id，服务端取冻结题目与回答，LLM 生成 预估分+判定依据+下次优化点
 * - zod schema 校验后写入会话 summary 缓存，并将会话置为 completed
 * - 熟悉话题不得调用本接口（不生成 Band/预估，FR-008）
 */
export async function POST(request: Request) {
  try {
    const actor = await readAuthenticatedActor(request.headers);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      sessionId?: string;
    } | null;
    const sessionId = body?.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    const db = getDatabase().db;

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.id, sessionId),
          eq(practiceSessions.userId, actor.userId),
        ),
      )
      .limit(1);
    if (!session) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    if (session.mode !== "standard_topic" || session.topicSetKey === "diagnostic") {
      return NextResponse.json(
        { error: "familiar sessions do not generate band summaries" },
        { status: 400 },
      );
    }

    const deliveries = await db
      .select()
      .from(questionDeliveries)
      .where(eq(questionDeliveries.sessionId, sessionId))
      .orderBy(asc(questionDeliveries.orderNo));

    const attempts = await db
      .select()
      .from(responseAttempts)
      .where(eq(responseAttempts.sessionId, sessionId))
      .orderBy(asc(responseAttempts.createdAt));

    const attemptIds = attempts.map((a) => a.id);
    const feedbackRows =
      attemptIds.length > 0
        ? await db
            .select()
            .from(responseFeedback)
            .where(inArray(responseFeedback.responseAttemptId, attemptIds))
        : [];
    const feedbackByAttempt = new Map(
      feedbackRows.map((f) => [f.responseAttemptId, f]),
    );

    const validAnswers = attempts
      .filter((a) => a.endedBy !== "skipped" && a.finalTranscript.trim())
      .map((a) => {
        const delivery = deliveries.find((d) => d.id === a.questionDeliveryId);
        const feedback = feedbackByAttempt.get(a.id);
        return {
          question: delivery?.textSnapshot ?? "",
          transcript: a.finalTranscript,
          vocabularyHighlights:
            feedback?.vocabularyHighlights?.map((v) => ({
              original: v.original,
              suggestion: v.suggestion,
            })) ?? [],
        };
      })
      .filter((r) => r.question && r.transcript);

    if (validAnswers.length === 0) {
      return NextResponse.json(
        { error: "no valid answers to summarize" },
        { status: 400 },
      );
    }

    const topic = deliveries[0]?.topic ?? session.topicSetKey;
    const stage = await readStageState(actor.userId);

    const prompt = getTopicSummaryPrompt({
      topic,
      rounds: validAnswers,
      currentBand: stage.currentBand ?? undefined,
    });
    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 2048, temperature: 0.3 },
    );

    const parsed = parseJsonFromLlm<unknown>(content);
    const result = topicSummarySchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json(
        { error: "summary schema validation failed" },
        { status: 502 },
      );
    }

    const summary: SessionSummary = {
      estimate: result.data.estimate,
      basis: result.data.basis,
      nextFocus: result.data.nextFocus,
      generatedAt: new Date().toISOString(),
    };

    await db
      .update(practiceSessions)
      .set({ summary, status: "completed", endedAt: new Date() })
      .where(eq(practiceSessions.id, sessionId));

    return NextResponse.json({ summary });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "话题总结失败" },
      { status: 500 },
    );
  }
}
