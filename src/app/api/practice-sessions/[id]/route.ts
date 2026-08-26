import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";

import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import {
  practiceSessions,
  questionDeliveries,
  responseAttempts,
  responseFeedback,
  type SessionSummary,
} from "@/persistence/schema";

export const runtime = "nodejs";

async function loadOwnedSession(userId: string, sessionId: string) {
  const db = getDatabase().db;
  const [session] = await db
    .select()
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.id, sessionId),
        eq(practiceSessions.userId, userId),
      ),
    )
    .limit(1);
  return session ?? null;
}

/** 恢复会话：冻结题目序列 + 已完成回答（刷新/断网恢复同一序列，FR-003/004） */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = getDatabase().db;
  const session = await loadOwnedSession(actor.userId, id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deliveries = await db
    .select()
    .from(questionDeliveries)
    .where(eq(questionDeliveries.sessionId, id))
    .orderBy(asc(questionDeliveries.orderNo));

  const attempts = await db
    .select()
    .from(responseAttempts)
    .where(eq(responseAttempts.sessionId, id))
    .orderBy(asc(responseAttempts.createdAt));

  const attemptIds = attempts.map((a) => a.id);
  const feedbackRows =
    attemptIds.length > 0
      ? await db
          .select()
          .from(responseFeedback)
          .where(
            inArray(responseFeedback.responseAttemptId, attemptIds),
          )
      : [];

  const feedbackByAttempt = new Map(
    feedbackRows.map((f) => [f.responseAttemptId, f]),
  );

  return NextResponse.json({
    session,
    deliveries,
    attempts: attempts.map((a) => ({
      ...a,
      feedback: feedbackByAttempt.get(a.id) ?? null,
    })),
  });
}

/**
 * 更新会话：完结（status=completed/abandoned）或写入总结缓存。
 * 只接受服务端可推导的字段，不信任客户端题文/版本。
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    status?: string;
    summary?: SessionSummary | null;
  } | null;

  const session = await loadOwnedSession(actor.userId, id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch: {
    status?: string;
    endedAt?: Date;
    summary?: SessionSummary | null;
  } = {};

  if (body?.status === "completed" || body?.status === "abandoned") {
    patch.status = body.status;
    patch.endedAt = new Date();
  }
  if ("summary" in (body ?? {}) && body) {
    patch.summary = body.summary ?? null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const db = getDatabase().db;
  const [updated] = await db
    .update(practiceSessions)
    .set(patch)
    .where(eq(practiceSessions.id, id))
    .returning();

  return NextResponse.json({ session: updated });
}

/** 删除练习会话（级联投递/回答/反馈；FR-010 record_deleted） */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const session = await loadOwnedSession(actor.userId, id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDatabase().db;
  await db
    .delete(practiceSessions)
    .where(eq(practiceSessions.id, id));

  return NextResponse.json({ deleted: true });
}
