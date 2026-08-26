import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import {
  practiceSessions,
  questionDeliveries,
  responseAttempts,
} from "@/persistence/schema";

export const runtime = "nodejs";

const ENDED_BY_VALUES = [
  "manual",
  "timeout",
  "asr_failed",
  "manual_input",
  "skipped",
] as const;
type EndedBy = (typeof ENDED_BY_VALUES)[number];

/**
 * 保存单题回答（FR-005/FR-007）：
 * - 回答先于反馈保存；同一 (session, delivery) 只允许一条回答（唯一约束 + onConflictDoNothing）
 * - 重录发生在转写确认阶段（未建答），确认后才调用本接口；重复调用返回已有记录，不重复建答
 * - endedBy=skipped 允许空转写（跳过此题）
 */
export async function POST(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    deliveryId?: string;
    finalTranscript?: string;
    durationSec?: number;
    endedBy?: string;
    audioRef?: string;
  } | null;

  const sessionId = body?.sessionId;
  const deliveryId = body?.deliveryId;
  if (!sessionId || !deliveryId) {
    return NextResponse.json(
      { error: "sessionId and deliveryId are required" },
      { status: 400 },
    );
  }

  const endedBy = (body?.endedBy ?? "manual") as EndedBy;
  if (!ENDED_BY_VALUES.includes(endedBy)) {
    return NextResponse.json({ error: "invalid endedBy" }, { status: 400 });
  }

  const transcript = body?.finalTranscript ?? "";
  if (!transcript.trim() && endedBy !== "skipped") {
    return NextResponse.json(
      { error: "finalTranscript is required (or use endedBy=skipped)" },
      { status: 400 },
    );
  }

  const db = getDatabase().db;

  // 资源归属校验：会话属于当前用户，且投递属于该会话
  const [session] = await db
    .select({ id: practiceSessions.id, userId: practiceSessions.userId })
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

  const [delivery] = await db
    .select({ id: questionDeliveries.id })
    .from(questionDeliveries)
    .where(
      and(
        eq(questionDeliveries.id, deliveryId),
        eq(questionDeliveries.sessionId, sessionId),
      ),
    )
    .limit(1);
  if (!delivery) {
    return NextResponse.json(
      { error: "delivery not found in session" },
      { status: 404 },
    );
  }

  // 幂等建答：已存在则返回已有记录
  const [created] = await db
    .insert(responseAttempts)
    .values({
      id: randomUUID(),
      userId: actor.userId,
      sessionId,
      questionDeliveryId: deliveryId,
      audioRef: body?.audioRef?.slice(0, 200) || null,
      finalTranscript: transcript.slice(0, 20000),
      durationSec: Math.max(0, Math.round(body?.durationSec ?? 0)),
      endedBy,
    })
    .onConflictDoNothing({
      target: [responseAttempts.sessionId, responseAttempts.questionDeliveryId],
    })
    .returning();

  if (created) {
    return NextResponse.json({ attempt: created, created: true }, { status: 201 });
  }

  const [existing] = await db
    .select()
    .from(responseAttempts)
    .where(
      and(
        eq(responseAttempts.sessionId, sessionId),
        eq(responseAttempts.questionDeliveryId, deliveryId),
      ),
    )
    .limit(1);

  return NextResponse.json({ attempt: existing, created: false });
}
