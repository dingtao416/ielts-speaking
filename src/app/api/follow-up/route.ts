import { NextResponse } from "next/server";

import { chatComplete, parseJsonFromLlm } from "@/lib/llm";
import { getFollowUpQuestionPrompt } from "@/lib/prompts";
import { getQuestions } from "@/lib/bank";

export const runtime = "nodejs";

// AI 逐题追问：生成当前话题的下一道英文 Part 1 问题。
// 生成失败时回退到题库中该话题的安全问题，不中断会话。
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const topic: string | undefined = body?.topic;
  const year: number | undefined = body?.year;
  const currentQuestion: string | undefined = body?.currentQuestion;
  const lastAnswer: string | undefined = body?.lastAnswer;
  const round: number = Number(body?.round ?? 1);
  const stageBand: number | undefined = body?.stageBand;

  if (!topic || typeof topic !== "string") {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  try {
    const prompt = getFollowUpQuestionPrompt({
      topic,
      year,
      currentQuestion,
      lastAnswer,
      round,
      stageBand,
    });

    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 120, temperature: 0.7 },
    );

    const parsed = parseJsonFromLlm<{ question?: string }>(content);
    const question = parsed?.question?.trim();

    if (!question) {
      throw new Error("Empty follow-up question");
    }

    return NextResponse.json({ question, fallback: false });
  } catch {
    // 回退到题库安全问题
    const safeQuestions = getQuestions("real", { part: 1, topic }).slice(0, 10);
    const fallbackQuestion =
      safeQuestions[Math.floor(Math.random() * safeQuestions.length)]?.question ??
      "Tell me about your daily routine.";

    return NextResponse.json({ question: fallbackQuestion, fallback: true });
  }
}
