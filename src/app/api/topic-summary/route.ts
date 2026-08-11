import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { chatComplete, parseJsonFromLlm } from "@/lib/llm";
import { getTopicSummaryPrompt } from "@/lib/prompts";
import { roundHalf } from "@/lib/profile";
import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import { user } from "@/persistence/schema";

export const runtime = "nodejs";

// 话题训练预估（训练用途，非官方成绩）：
// 汇总话题内全部回答，LLM 生成预估分 + 判定依据 + 下次优化点。
export async function POST(request: Request) {
  try {
    const actor = await readAuthenticatedActor(request.headers);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const topic: string | undefined = body?.topic;
    const rounds: {
      question: string;
      transcript: string;
      vocabularyHighlights: { original: string; suggestion: string }[];
    }[] = body?.rounds;

    if (!topic || !Array.isArray(rounds) || rounds.length === 0) {
      return NextResponse.json(
        { error: "topic and rounds are required" },
        { status: 400 },
      );
    }

    // 读当前综合水平作为预估上下文
    const db = getDatabase().db;
    const [userRow] = await db
      .select({ profile: user.profile })
      .from(user)
      .where(eq(user.id, actor.userId))
      .limit(1);
    const currentBand = userRow?.profile?.overallBand ?? 5.0;

    const prompt = getTopicSummaryPrompt({ topic, rounds, currentBand });
    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 500, temperature: 0.3 },
    );

    const parsed = parseJsonFromLlm<{
      estimate?: number;
      basis?: string;
      nextFocus?: string[];
    }>(content);

    const rawEstimate = Number(parsed.estimate);
    const estimate = roundHalf(
      Number.isFinite(rawEstimate) ? Math.max(0, Math.min(9, rawEstimate)) : currentBand,
    );
    const basis =
      typeof parsed.basis === "string" && parsed.basis.trim()
        ? parsed.basis
        : "";
    const nextFocus = Array.isArray(parsed.nextFocus)
      ? parsed.nextFocus.filter((s) => typeof s === "string" && s.trim()).slice(0, 2)
      : [];

    return NextResponse.json({ estimate, basis, nextFocus });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "话题总结失败" },
      { status: 500 },
    );
  }
}
