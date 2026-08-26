import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import { analyticsEvents } from "@/persistence/schema";

export const runtime = "nodejs";

/**
 * 核心埋点接收（PRD §8）：
 * - 只接受 name + 轻量 props；服务端再次裁剪，不落完整转写/音频/PII
 * - 事件名白名单校验
 */
const ALLOWED_EVENTS = new Set([
  "practice_mode_selected",
  "personal_background_category_selected",
  "standard_topic_selected",
  "practice_started",
  "question_shown",
  "recording_started",
  "recording_ended",
  "transcript_confirmed",
  "response_feedback_ready",
  "feedback_unavailable",
  "question_completed",
  "session_completed",
  "history_opened",
  "repractice_started",
  "diagnostic_started",
  "diagnostic_completed",
  "stage_target_changed",
  "record_deleted",
]);

const MAX_PROP_LENGTH = 200;

export async function POST(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    props?: unknown;
  } | null;

  const name = body?.name;
  if (!name || typeof name !== "string" || !ALLOWED_EVENTS.has(name)) {
    return NextResponse.json({ error: "invalid event name" }, { status: 400 });
  }

  // 只保留可序列化的扁平轻量属性，截断长字符串
  const raw = body?.props && typeof body.props === "object" ? (body.props as Record<string, unknown>) : {};
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(props).length >= 8) break;
    if (typeof value === "string") {
      props[key] = value.slice(0, MAX_PROP_LENGTH);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      props[key] = value;
    }
  }

  const db = getDatabase().db;
  await db.insert(analyticsEvents).values({
    id: randomUUID(),
    userId: actor.userId,
    name,
    props,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
