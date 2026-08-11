import { chatCompleteStream } from "@/lib/llm";
import { getRecommendedAnswerPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

// 单题表达反馈 - 推荐回答（SSE 流式）：
// 结束回答后立即以流式输出阶段匹配的推荐回答，用户逐字看到内容。
// 词汇标黄由前端本地词库即时生成（毫秒级），不依赖此接口。
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic: string | undefined = body?.topic;
    const question: string | undefined = body?.question;
    const transcript: string | undefined = body?.transcript;
    const stageBand: number | undefined = body?.stageBand;

    if (!question || !transcript || typeof transcript !== "string") {
      return Response.json(
        { error: "question and transcript are required" },
        { status: 400 },
      );
    }

    const prompt = getRecommendedAnswerPrompt({
      topic: topic ?? "",
      question,
      transcript,
      stageBand,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await chatCompleteStream(
            [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
            {
              maxTokens: 400,
              temperature: 0.4,
              onChunk: (delta) => {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`),
                );
              },
            },
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "stream failed";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Feedback failed" },
      { status: 500 },
    );
  }
}
