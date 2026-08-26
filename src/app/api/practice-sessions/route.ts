import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import {
  practiceSessions,
  questionDeliveries,
  responseAttempts,
  type NewPracticeSession,
  type NewQuestionDelivery,
} from "@/persistence/schema";
import {
  getFamiliarSet,
  getFamiliarSetVersion,
  getStandardBankVersion,
  getStandardTopicSetById,
  resolveStandardTopicSet,
  getDiagnosticTopicSets,
} from "@/lib/bank";

export const runtime = "nodejs";

const PRACTICE_MODES = ["personal_background", "standard_topic"] as const;
type PracticeMode = (typeof PRACTICE_MODES)[number];

/** 列出当前用户最近的练习会话（FR-010：按话题类型分组展示） */
export async function GET(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDatabase().db;
  const rows = await db
    .select({
      session: practiceSessions,
      topicName: sql<string | null>`min(${questionDeliveries.topic})`,
      deliveryCount: sql<number>`count(distinct ${questionDeliveries.id})`,
      answeredCount: sql<number>`count(distinct ${responseAttempts.id})`,
    })
    .from(practiceSessions)
    .leftJoin(questionDeliveries, eq(questionDeliveries.sessionId, practiceSessions.id))
    .leftJoin(responseAttempts, eq(responseAttempts.sessionId, practiceSessions.id))
    .where(eq(practiceSessions.userId, actor.userId))
    .groupBy(practiceSessions.id)
    .orderBy(desc(practiceSessions.startedAt))
    .limit(100);

  return NextResponse.json({
    sessions: rows.map((r) => ({
      ...r.session,
      topicName: r.topicName,
      deliveryCount: Number(r.deliveryCount),
      answeredCount: Number(r.answeredCount),
    })),
  });
}

/**
 * 创建练习会话（FR-002/FR-003）：
 * - 服务端按 topicSetKey 读取已发布题组，冻结 questionId/顺序/题文快照/bankVersion
 * - 熟悉话题恒 diagnosticEligible=false（FR-008 硬隔离）
 * - 不调用任何题目生成服务
 */
export async function POST(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: string;
    topicSetKey?: string;
    diagnostic?: boolean;
  } | null;

  const mode = body?.mode as PracticeMode | undefined;
  if (!mode || !PRACTICE_MODES.includes(mode)) {
    return NextResponse.json({ error: "mode is required" }, { status: 400 });
  }
  const topicSetKey = body?.topicSetKey;
  if (!topicSetKey || typeof topicSetKey !== "string") {
    return NextResponse.json(
      { error: "topicSetKey is required" },
      { status: 400 },
    );
  }

  // 1) 按模式解析题组（只允许已发布内容）
  let bankVersion: string;
  let diagnosticEligible: boolean;
  let deliveries: { questionId: string; textSnapshot: string; topic: string }[];

  if (mode === "personal_background") {
    const category = getFamiliarSet(topicSetKey);
    if (!category) {
      return NextResponse.json(
        { error: "unknown familiar category" },
        { status: 400 },
      );
    }
    bankVersion = getFamiliarSetVersion();
    diagnosticEligible = false;
    deliveries = category.questions.map((q) => ({
      questionId: q.id,
      textSnapshot: q.question,
      topic: category.label.en,
    }));
  } else {
    // standard_topic：普通练习按题组；诊断包 = 标记 diagnostic 的已发布题组（默认 2 组 × 4 题）
    if (body?.diagnostic === true) {
      const sets = getDiagnosticTopicSets();
      if (sets.length === 0) {
        return NextResponse.json(
          { error: "diagnostic package not configured" },
          { status: 500 },
        );
      }
      bankVersion = getStandardBankVersion();
      diagnosticEligible = true;
      deliveries = sets.flatMap((set) =>
        resolveStandardTopicSet(set).questions.map((q) => ({
          questionId: q.id,
          textSnapshot: q.question,
          topic: set.topic,
        })),
      );
    } else {
      const set = getStandardTopicSetById(topicSetKey);
      if (!set) {
        return NextResponse.json(
          { error: "unknown standard topic set" },
          { status: 400 },
        );
      }
      const resolved = resolveStandardTopicSet(set);
      if (resolved.questions.length === 0) {
        return NextResponse.json(
          { error: "topic set has no resolvable questions" },
          { status: 500 },
        );
      }
      bankVersion = getStandardBankVersion();
      diagnosticEligible = true;
      deliveries = resolved.questions.map((q) => ({
        questionId: q.id,
        textSnapshot: q.question,
        topic: set.topic,
      }));
    }
  }

  // 2) 事务内创建会话 + 冻结投递
  const db = getDatabase().db;
  const sessionId = randomUUID();
  const startedAt = new Date();

  const session: NewPracticeSession = {
    id: sessionId,
    userId: actor.userId,
    mode,
    topicSetKey,
    bankVersion,
    diagnosticEligible,
    status: "in_progress",
    startedAt,
  };

  const frozen: NewQuestionDelivery[] = deliveries.map((d, i) => ({
    id: randomUUID(),
    sessionId,
    questionId: d.questionId,
    orderNo: i + 1,
    textSnapshot: d.textSnapshot,
    topic: d.topic,
    bankVersion,
    deliverySource:
      mode === "personal_background"
        ? "personal_background_fixed"
        : "standard_published",
  }));

  await db.transaction(async (tx) => {
    await tx.insert(practiceSessions).values(session);
    if (frozen.length > 0) {
      await tx.insert(questionDeliveries).values(frozen);
    }
  });

  return NextResponse.json(
    {
      session: { ...session, startedAt: startedAt.toISOString() },
      deliveries: frozen.map((d) => ({
        id: d.id,
        orderNo: d.orderNo,
        questionId: d.questionId,
        textSnapshot: d.textSnapshot,
        topic: d.topic,
      })),
    },
    { status: 201 },
  );
}
