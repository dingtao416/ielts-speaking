import { NextResponse } from "next/server";

import { chatComplete, chatCompleteStream, type LlmMessage } from "@/lib/llm";

export const runtime = "nodejs";

// 通用 LLM 代理。stream:true 返回 SSE，stream:false 返回 JSON。
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages: LlmMessage[] = body?.messages;
    const stream = Boolean(body?.stream);
    const maxTokens = typeof body?.maxTokens === "number" ? body.maxTokens : 1024;
    const temperature =
      typeof body?.temperature === "number" ? body.temperature : undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages is required" }, { status: 400 });
    }

    if (!stream) {
      const content = await chatComplete(messages, { maxTokens, temperature });
      return NextResponse.json({ content });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        let started = false;
        try {
          await chatCompleteStream(messages, {
            maxTokens,
            temperature,
            onChunk: (chunk) => {
              if (!started) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "" } }] })}\n\n`));
                started = true;
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
            },
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err?.message ?? "stream failed" })}\n\n`));
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
