import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import {
  practiceSessions,
  questionDeliveries,
  responseAttempts,
  responseFeedback,
  diagnosticAssessments,
  user,
  type BandEvidence,
  type AbilityProfile,
} from "@/persistence/schema";
import { chatComplete, parseJsonFromLlm } from "@/lib/llm";
import { getV1DiagnosticPrompt } from "@/lib/prompts";
import { v1DiagnosticSchema } from "@/lib/feedback-schemas";
import { buildStagePath, planStageBands, roundHalf } from "@/lib/profile";

export const runtime = "nodejs";

/** 诊断包有效回答数（PRD 5.4：默认 8 道有效回答） */
const DIAGNOSTIC_ANSWER_COUNT = 8;

/**
 * V1 标准题首次诊断/复测（FR-009）：
 * - 输入：diagnostic 会话（固定 8 道标准题包，不含熟悉话题）
 * - 未完成 8 道有效回答 → 400，不生成、不覆盖正式档案
 * - 无有效音频证据时 pronunciation="未评估"（null），不生成发音数值
 * - 完成后写 DiagnosticAssessment + 用户档案列 + onboarded
 */
export async function POST(request: Request) {
  try {
    const actor = await readAuthenticatedActor(request.headers);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      sessionId?: string;
      finalGoalBand?: number;
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
    if (session.mode !== "standard_topic" || session.topicSetKey !== "diagnostic") {
      return NextResponse.json(
        { error: "diagnostic requires a diagnostic session" },
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

    const valid = attempts.filter(
      (a) => a.endedBy !== "skipped" && a.finalTranscript.trim(),
    );
    if (valid.length < DIAGNOSTIC_ANSWER_COUNT) {
      return NextResponse.json(
        {
          error: `diagnostic requires ${DIAGNOSTIC_ANSWER_COUNT} valid answers`,
          answered: valid.length,
          required: DIAGNOSTIC_ANSWER_COUNT,
        },
        { status: 400 },
      );
    }

    // 证据状态：无任何有效音频引用 → 发音未评估（FR-009 / NFR）
    const hasAudioEvidence = valid.some((a) => Boolean(a.audioRef));

    const attemptIds = valid.map((a) => a.id);
    const feedbackRows = await db
      .select()
      .from(responseFeedback)
      .where(inArray(responseFeedback.responseAttemptId, attemptIds));
    const feedbackByAttempt = new Map(
      feedbackRows.map((f) => [f.responseAttemptId, f]),
    );

    const answers = valid.map((a) => {
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
    });

    const [userRow] = await db
      .select({
        finalGoalBand: user.finalGoalBand,
        targetBand: user.targetBand,
        profile: user.profile,
      })
      .from(user)
      .where(eq(user.id, actor.userId))
      .limit(1);
    const finalGoalBand =
      (body?.finalGoalBand != null ? Number(body.finalGoalBand) : Number(userRow?.finalGoalBand)) ||
      Number(userRow?.targetBand) ||
      6.5;

    // LLM 四维评估（结构化 + zod 校验）
    const prompt = getV1DiagnosticPrompt({ answers, targetBand: finalGoalBand });
    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 3000, temperature: 0.3 },
    );
    const parsed = parseJsonFromLlm<unknown>(content);
    const result = v1DiagnosticSchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json(
        { error: "diagnostic schema validation failed" },
        { status: 502 },
      );
    }

    const raw = result.data;
    const roundBand = (v: number | null) =>
      v == null ? null : roundHalf(Math.max(0, Math.min(9, v)));
    const overall = roundHalf(Math.max(0, Math.min(9, raw.overall)));

    // 无音频证据 → 发音"未评估"（不生成发音数值）
    const pronunciation = hasAudioEvidence ? roundBand(raw.dimensions.pronunciation) : null;

    const bandEvidence: BandEvidence = {
      dimensions: {
        fluency: roundBand(raw.dimensions.fluency),
        lexical: roundBand(raw.dimensions.lexical),
        grammar: roundBand(raw.dimensions.grammar),
        pronunciation,
      },
      overall,
      notes: raw.notes.slice(0, 6),
    };

    // 阶段规划
    const stages = planStageBands(overall, finalGoalBand);
    const activeStageBand = stages[0];
    const stagePlan = buildStagePath(overall, finalGoalBand);

    const now = new Date();

    // 写入诊断记录（completed）
    await db.insert(diagnosticAssessments).values({
      id: randomUUID(),
      userId: actor.userId,
      sessionId,
      standardResponseIds: valid.map((a) => a.id),
      bandEvidence,
      activeStageBand: String(activeStageBand),
      confidence: null,
      status: "completed",
      completedAt: now,
    });

    // 更新用户档案列（只由标准题诊断/复测更新）
    const legacyProfile: AbilityProfile = {
      overallBand: overall,
      targetBand: finalGoalBand,
      dimensions: {
        fluency: bandEvidence.dimensions.fluency ?? overall,
        lexical: bandEvidence.dimensions.lexical ?? overall,
        grammar: bandEvidence.dimensions.grammar ?? overall,
        pronunciation: pronunciation ?? overall,
        overall,
      },
      mainIssues: raw.notes.slice(0, 5),
      stagePath: stagePlan,
      updatedAt: now.toISOString(),
    };

    await db
      .update(user)
      .set({
        finalGoalBand: String(finalGoalBand),
        targetBand: String(finalGoalBand),
        currentBand: String(overall),
        activeStageBand: String(activeStageBand),
        stagePlan,
        diagnosticStatus: "completed",
        profile: legacyProfile,
        onboarded: true,
        onboardedAt: now,
      })
      .where(eq(user.id, actor.userId));

    // 会话完结
    await db
      .update(practiceSessions)
      .set({ status: "completed", endedAt: now })
      .where(eq(practiceSessions.id, sessionId));

    return NextResponse.json({
      assessment: {
        bandEvidence,
        currentBand: overall,
        finalGoalBand,
        activeStageBand,
        stagePlan,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "诊断失败，请稍后重试" },
      { status: 500 },
    );
  }
}
