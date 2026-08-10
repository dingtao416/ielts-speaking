import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import { frameworks } from "@/persistence/schema";

export const runtime = "nodejs";

// 删除一个框架（仅本人）
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const db = getDatabase().db;
  const existing = await db
    .select()
    .from(frameworks)
    .where(and(eq(frameworks.id, id), eq(frameworks.userId, actor.userId)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(frameworks).where(eq(frameworks.id, id));
  return NextResponse.json({ ok: true });
}
