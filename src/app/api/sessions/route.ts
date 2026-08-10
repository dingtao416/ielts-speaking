import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import { sessionRecords } from "@/persistence/schema";
import type { SaveSessionInput } from "@/lib/session-types";

export const runtime = "nodejs";

// 列出当前用户最近的练习记录
export async function GET(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDatabase().db;
  const rows = await db
    .select()
    .from(sessionRecords)
    .where(eq(sessionRecords.userId, actor.userId))
    .orderBy(desc(sessionRecords.startTime))
    .limit(100);

  return NextResponse.json({ sessions: rows });
}

// 保存一次练习记录
export async function POST(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as SaveSessionInput | null;
  if (!body || typeof body.fullText !== "string" || !body.fullText) {
    return NextResponse.json(
      { error: "fullText is required" },
      { status: 400 },
    );
  }

  const db = getDatabase().db;
  const [row] = await db
    .insert(sessionRecords)
    .values({
      id: randomUUID(),
      userId: actor.userId,
      questionId: body.questionId ?? null,
      topic: body.topic ?? null,
      part: body.part ?? null,
      mode: body.mode,
      startTime: new Date(),
      durationSec: Math.max(0, Math.round(body.durationSec ?? 0)),
      fullText: body.fullText.slice(0, 20000),
      stats: body.stats,
      bands: body.bands ?? null,
      bandEstimate:
        typeof body.bandEstimate === "number"
          ? String(body.bandEstimate)
          : null,
      reportMarkdown: body.reportMarkdown?.slice(0, 30000) ?? null,
      frameworkId: body.frameworkId ?? null,
    })
    .returning();

  return NextResponse.json({ session: row }, { status: 201 });
}
