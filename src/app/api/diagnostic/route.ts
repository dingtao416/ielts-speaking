import { NextResponse } from "next/server";

import { chatComplete, parseJsonFromLlm } from "@/lib/llm";
import { getDiagnosticPrompt } from "@/lib/prompts";
import { roundHalf } from "@/lib/profile";
import type { AbilityProfile } from "@/persistence/schema";

export const runtime = "nodejs";

interface DiagnosticAnswer {
  part: number;
  question: string;
  text: string;
}

// 首次诊断：输入 3 段回答（Part1/2/3 各一）→ 生成能力档案
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const answers: DiagnosticAnswer[] = body?.answers;
    const targetBand = Number(body?.targetBand ?? 6.5);

    if (
      !Array.isArray(answers) ||
      answers.length < 2 ||
      answers.some((a) => !a?.text || a.text.trim().length < 10)
    ) {
      return NextResponse.json(
        { error: "至少需要 2 段有效的回答（建议 Part1/2/3 各一段）" },
        { status: 400 },
      );
    }

    const prompt = getDiagnosticPrompt(answers, targetBand);
    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 1200, temperature: 0.3 },
    );

    const parsed = parseJsonFromLlm<Partial<AbilityProfile>>(content);

    // 校验并规整
    const overallBand = roundHalf(Number(parsed.overallBand) || 5.0);
    const dimensions = {
      fluency: roundHalf(Number(parsed.dimensions?.fluency) || overallBand),
      lexical: roundHalf(Number(parsed.dimensions?.lexical) || overallBand),
      grammar: roundHalf(Number(parsed.dimensions?.grammar) || overallBand),
      pronunciation: roundHalf(Number(parsed.dimensions?.pronunciation) || overallBand),
      overall: overallBand,
    };

    const profile: AbilityProfile = {
      overallBand,
      targetBand,
      dimensions,
      mainIssues: Array.isArray(parsed.mainIssues)
        ? parsed.mainIssues.filter((s) => typeof s === "string").slice(0, 5)
        : [],
      stagePath: Array.isArray(parsed.stagePath)
        ? parsed.stagePath.filter((s) => typeof s === "string").slice(0, 5)
        : [],
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ profile });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "诊断失败，请稍后重试" },
      { status: 500 },
    );
  }
}
