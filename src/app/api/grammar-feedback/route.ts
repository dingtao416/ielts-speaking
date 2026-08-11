import { NextResponse } from "next/server";

import { chatComplete, parseJsonFromLlm } from "@/lib/llm";
import { getGrammarRewritePrompt } from "@/lib/prompts";

export const runtime = "nodejs";

// 单题语法/改写反馈（复盘详情）：语法与句子结构建议 + 自然改写。
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question: string | undefined = body?.question;
    const transcript: string | undefined = body?.transcript;
    const stageBand: number | undefined = body?.stageBand;

    if (!question || !transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "question and transcript are required" },
        { status: 400 },
      );
    }

    const prompt = getGrammarRewritePrompt({ question, transcript, stageBand });
    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 500, temperature: 0.3 },
    );

    const parsed = parseJsonFromLlm<{
      grammarNotes?: string;
      naturalRewrite?: string;
    }>(content);

    return NextResponse.json({
      grammarNotes:
        typeof parsed.grammarNotes === "string" && parsed.grammarNotes.trim()
          ? parsed.grammarNotes
          : "",
      naturalRewrite:
        typeof parsed.naturalRewrite === "string" && parsed.naturalRewrite.trim()
          ? parsed.naturalRewrite
          : "",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "语法反馈失败" },
      { status: 500 },
    );
  }
}
