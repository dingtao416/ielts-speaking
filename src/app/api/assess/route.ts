import { NextResponse } from "next/server";

import { chatComplete, parseJsonFromLlm } from "@/lib/llm";
import { getAssessPrompt } from "@/lib/prompts";
import { getQuestionById } from "@/lib/bank";
import { roundHalf } from "@/lib/profile";
import { readAuthenticatedActor } from "@/application/authentication";
import { updateProfileFromSession } from "@/application/profile-updater";

export const runtime = "nodejs";

// 单次练习评估：输入回答 → 四维 band，并更新用户能力档案
export async function POST(request: Request) {
  try {
    const actor = await readAuthenticatedActor(request.headers);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const fullText: string = body?.fullText;
    const stats = body?.stats;
    const questionId: string | undefined = body?.questionId;

    if (!fullText || typeof fullText !== "string" || fullText.trim().length < 10) {
      return NextResponse.json(
        { error: "回答内容太短，无法评估" },
        { status: 400 },
      );
    }

    const question = questionId ? getQuestionById(questionId) : undefined;
    const prompt = getAssessPrompt(fullText, stats ?? {}, question ?? undefined);

    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 500, temperature: 0.2 },
    );

    const parsed = parseJsonFromLlm<{
      fluency?: number;
      lexical?: number;
      grammar?: number;
      pronunciation?: number;
      overall?: number;
      mainIssues?: string[];
    }>(content);

    const fluency = roundHalf(Number(parsed.fluency) || 5.0);
    const lexical = roundHalf(Number(parsed.lexical) || 5.0);
    const grammar = roundHalf(Number(parsed.grammar) || 5.0);
    const pronunciation = roundHalf(Number(parsed.pronunciation) || 5.0);
    const overall = roundHalf(
      Number(parsed.overall) ||
        (fluency + lexical + grammar + pronunciation) / 4,
    );
    const bands = { fluency, lexical, grammar, pronunciation, overall };
    const mainIssues = Array.isArray(parsed.mainIssues)
      ? parsed.mainIssues.filter((s) => typeof s === "string").slice(0, 4)
      : [];

    // 更新能力档案（加权平均，避免单次波动）
    const profile = await updateProfileFromSession(actor.userId, bands, mainIssues);

    return NextResponse.json({ bands, mainIssues, profile });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "评估失败" },
      { status: 500 },
    );
  }
}
