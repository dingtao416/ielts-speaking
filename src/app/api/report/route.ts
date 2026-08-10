import { NextResponse } from "next/server";

import { chatCompleteStream } from "@/lib/llm";
import { getReportPrompt } from "@/lib/prompts";
import { getQuestionById } from "@/lib/bank";

export const runtime = "nodejs";

// 生成练习报告（SSE 流式 markdown）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fullText: string = body?.fullText;
    const stats = body?.stats;
    if (!fullText || typeof fullText !== "string" || !fullText.trim()) {
      return NextResponse.json({ error: "fullText is required" }, { status: 400 });
    }
    if (fullText.length > 20000) {
      return NextResponse.json({ error: "fullText too long" }, { status: 400 });
    }
    if (!stats || typeof stats !== "object") {
      return NextResponse.json({ error: "stats is required" }, { status: 400 });
    }

    const questionId: string | undefined = body?.questionId;
    const question = questionId ? getQuestionById(questionId) : undefined;
    const prompt = getReportPrompt(fullText, stats, question ?? undefined);

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await chatCompleteStream(
            [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
            {
              maxTokens: 4096,
              onChunk: (chunk) => {
                const payload = `data: ${JSON.stringify({ text: chunk })}\n\n`;
                controller.enqueue(encoder.encode(payload));
              },
            },
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err: any) {
          const payload = `data: ${JSON.stringify({ error: err?.message ?? "report failed" })}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Bad request" },
      { status: 400 },
    );
  }
}
