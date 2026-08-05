import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import { frameworks } from "@/persistence/schema";
import { toFramework } from "@/lib/frameworks";

export const runtime = "nodejs";

function parseFrameworkBody(body: unknown) {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return null;
  const topic = typeof b.topic === "string" ? b.topic.trim() : "";
  const part = typeof b.part === "number" ? b.part : 0;
  if (!topic || ![1, 2, 3].includes(part)) return null;

  const structure = Array.isArray(b.structure)
    ? b.structure.filter((s): s is string => typeof s === "string")
    : [];
  const keyPoints = Array.isArray(b.keyPoints)
    ? b.keyPoints.filter((s): s is string => typeof s === "string")
    : [];
  const expressions = Array.isArray(b.expressions)
    ? b.expressions
        .filter(
          (e): e is { phrase: string; meaning: string } =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as { phrase?: unknown }).phrase === "string" &&
            typeof (e as { meaning?: unknown }).meaning === "string",
        )
        .slice(0, 20)
    : [];
  const intro =
    typeof b.intro === "string" && b.intro.trim() ? b.intro.trim() : null;
  const sourceQuestionId =
    typeof b.sourceQuestionId === "string" && b.sourceQuestionId
      ? b.sourceQuestionId
      : null;
  const sourceYear = typeof b.sourceYear === "number" ? b.sourceYear : null;

  return {
    topic,
    part,
    structure,
    keyPoints,
    expressions,
    intro,
    sourceQuestionId,
    sourceYear,
  };
}

// 列出当前用户的框架
export async function GET(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDatabase().db;
  const rows = await db
    .select()
    .from(frameworks)
    .where(eq(frameworks.userId, actor.userId))
    .orderBy(frameworks.updatedAt);

  return NextResponse.json({ frameworks: rows.map(toFramework) });
}

// 保存 / 更新一个框架（upsert by id）
export async function POST(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseFrameworkBody(body);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid framework payload" },
      { status: 400 },
    );
  }

  const db = getDatabase().db;
  const id =
    typeof body?.id === "string" && body.id ? body.id : randomUUID();

  const existing = await db
    .select()
    .from(frameworks)
    .where(eq(frameworks.id, id))
    .limit(1);

  if (existing.length > 0 && existing[0].userId !== actor.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (existing.length > 0) {
    const [row] = await db
      .update(frameworks)
      .set({
        topic: parsed.topic,
        part: parsed.part,
        structure: parsed.structure,
        keyPoints: parsed.keyPoints,
        expressions: parsed.expressions,
        intro: parsed.intro,
        sourceQuestionId: parsed.sourceQuestionId,
        sourceYear: parsed.sourceYear,
        updatedAt: new Date(),
      })
      .where(eq(frameworks.id, id))
      .returning();
    return NextResponse.json({ framework: toFramework(row) });
  }

  const [row] = await db
    .insert(frameworks)
    .values({
      id,
      userId: actor.userId,
      topic: parsed.topic,
      part: parsed.part,
      structure: parsed.structure,
      keyPoints: parsed.keyPoints,
      expressions: parsed.expressions,
      intro: parsed.intro,
      sourceQuestionId: parsed.sourceQuestionId,
      sourceYear: parsed.sourceYear,
    })
    .returning();

  return NextResponse.json({ framework: toFramework(row) }, { status: 201 });
}
