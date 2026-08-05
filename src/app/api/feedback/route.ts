import { NextResponse } from "next/server";

import { chatComplete } from "@/lib/llm";
import { getRealtimePrompt } from "@/lib/prompts";

export const runtime = "nodejs";

// 实时教练：返回 1 条短提示。非流式，目标 <1.2s。
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text: string = body?.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const prompt = getRealtimePrompt(text, {
      elapsedSec: body?.elapsedSec,
      topic: body?.topic,
      part: body?.part,
      previousPoints: body?.previousPoints,
      mode: body?.mode,
    });

    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 40, temperature: 0.5 },
    );

    const tip = content.trim().split("\n").filter(Boolean)[0] ?? "";
    return NextResponse.json({ tip });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Feedback failed" },
      { status: 500 },
    );
  }
}
