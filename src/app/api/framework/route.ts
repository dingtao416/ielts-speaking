import { NextResponse } from "next/server";

import { chatComplete } from "@/lib/llm";
import { getFrameworkPrompt } from "@/lib/prompts";
import { getQuestionById } from "@/lib/bank";
import { analyzeText } from "@/lib/lexicon";

export const runtime = "nodejs";

// 从回答中提取答题框架（JSON-only）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const questionId: string = body?.questionId;
    const fullText: string = body?.fullText;

    if (!questionId || !fullText) {
      return NextResponse.json(
        { error: "questionId and fullText are required" },
        { status: 400 },
      );
    }

    const question = getQuestionById(questionId);
    if (!question) {
      return NextResponse.json({ error: "question not found" }, { status: 404 });
    }

    const stats = analyzeText(fullText) ?? {
      totalWords: fullText.split(/\s+/).length,
      fillers: 0,
      hedges: 0,
      vagueWords: 0,
      chinglish: 0,
      grammar: 0,
      density: 100,
      duration: 0,
    };

    const prompt = getFrameworkPrompt(question, fullText, stats);
    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 1024, temperature: 0.4 },
    );

    // 提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Framework extraction returned invalid JSON" },
        { status: 500 },
      );
    }

    let framework: unknown;
    try {
      framework = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: "Framework extraction returned invalid JSON" },
        { status: 500 },
      );
    }

    return NextResponse.json({ framework });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Framework extraction failed" },
      { status: 500 },
    );
  }
}
