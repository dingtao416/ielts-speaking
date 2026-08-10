import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import { user } from "@/persistence/schema";
import type { AbilityProfile } from "@/persistence/schema";

export const runtime = "nodejs";

// 读当前用户的能力档案
export async function GET(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDatabase().db;
  const [row] = await db
    .select({
      targetBand: user.targetBand,
      profile: user.profile,
      onboarded: user.onboarded,
      onboardedAt: user.onboardedAt,
    })
    .from(user)
    .where(eq(user.id, actor.userId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    targetBand: row.targetBand ? Number(row.targetBand) : null,
    profile: row.profile ?? null,
    onboarded: row.onboarded,
    onboardedAt: row.onboardedAt,
  });
}

// 更新目标分数 / 能力档案 / onboarding 状态
export async function POST(request: Request) {
  const actor = await readAuthenticatedActor(request.headers);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getDatabase().db;
  const updates: Record<string, unknown> = {};

  if (typeof body.targetBand === "number") {
    const band = Number(body.targetBand);
    if (band < 4 || band > 9) {
      return NextResponse.json({ error: "Invalid target band" }, { status: 400 });
    }
    updates.targetBand = String(band);
  }

  if (body.profile && typeof body.profile === "object") {
    const profile = body.profile as AbilityProfile;
    // 基本校验
    if (
      typeof profile.overallBand === "number" &&
      profile.dimensions &&
      typeof profile.dimensions === "object"
    ) {
      updates.profile = {
        ...profile,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  if (typeof body.onboarded === "boolean") {
    updates.onboarded = body.onboarded;
    if (body.onboarded) {
      updates.onboardedAt = new Date();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const [row] = await db
    .update(user)
    .set(updates)
    .where(eq(user.id, actor.userId))
    .returning({
      targetBand: user.targetBand,
      profile: user.profile,
      onboarded: user.onboarded,
      onboardedAt: user.onboardedAt,
    });

  return NextResponse.json({
    targetBand: row.targetBand ? Number(row.targetBand) : null,
    profile: row.profile ?? null,
    onboarded: row.onboarded,
    onboardedAt: row.onboardedAt,
  });
}
