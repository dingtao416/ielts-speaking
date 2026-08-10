import "server-only";

import { parseServerEnvironment } from "@/config/environment";

const environment = parseServerEnvironment(process.env);

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmConfig {
  configured: boolean;
  provider: string;
  model: string;
}

/** 当前生效的 LLM 配置（服务端，绝不暴露 Key） */
export function getLlmConfig(): LlmConfig {
  const { provider, deepseek, openai, custom } = environment.llm;
  if (provider === "deepseek" && deepseek) {
    return { configured: true, provider: "deepseek", model: deepseek.model };
  }
  if (provider === "openai" && openai) {
    return { configured: true, provider: "openai", model: openai.model };
  }
  if (provider === "custom" && custom) {
    return { configured: true, provider: "custom", model: custom.model };
  }
  return { configured: false, provider, model: "" };
}

function resolveEndpoint() {
  const { provider, deepseek, openai, custom } = environment.llm;
  if (provider === "deepseek" && deepseek) {
    return { url: `${deepseek.baseUrl.replace(/\/+$/, "")}/chat/completions`, key: deepseek.apiKey, model: deepseek.model };
  }
  if (provider === "openai" && openai) {
    return { url: `${openai.baseUrl.replace(/\/+$/, "")}/chat/completions`, key: openai.apiKey, model: openai.model };
  }
  if (provider === "custom" && custom) {
    return { url: `${custom.baseUrl.replace(/\/+$/, "")}/chat/completions`, key: custom.apiKey, model: custom.model };
  }
  return null;
}

/** 给 fetch 加超时：超时抛出明确错误，避免前端无限等待 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function chatComplete(
  messages: LlmMessage[],
  options?: { maxTokens?: number; temperature?: number; timeoutMs?: number },
): Promise<string> {
  const config = resolveEndpoint();
  if (!config) {
    throw new Error("LLM provider is not configured on the server.");
  }

  const response = await fetchWithTimeout(
    config.url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? environment.llm.temperature,
        stream: false,
      }),
    },
    options?.timeoutMs ?? 20_000,
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LLM request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  // DeepSeek 的 message 可能含 reasoning_content(思考)和 content(正式回答)。
  // 优先取 content，只有 content 完全缺失时才回退到 reasoning_content。
  const content: string | undefined =
    typeof message?.content === "string" && message.content
      ? message.content
      : message?.reasoning_content;
  if (!content) {
    throw new Error("LLM returned empty content.");
  }
  return content;
}

/** SSE 流式调用，逐块回调文本。返回可中止的 controller。 */
export async function chatCompleteStream(
  messages: LlmMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    onChunk: (text: string) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<string> {
  const config = resolveEndpoint();
  if (!config) {
    throw new Error("LLM provider is not configured on the server.");
  }

  const response = await fetchWithTimeout(
    config.url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: options?.maxTokens ?? 2048,
        temperature: options?.temperature ?? environment.llm.temperature,
        stream: true,
      }),
      signal: options?.signal,
    },
    options?.timeoutMs ?? 20_000,
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LLM stream failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  if (!response.body) {
    throw new Error("LLM stream returned no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const d = parsed?.choices?.[0]?.delta ?? {};
        // DeepSeek 流式先输出 reasoning_content(思考)再输出 content(正式回答)。
        // 这里只透传 content，避免把思考过程当答案流式输出给用户。
        const delta = typeof d.content === "string" ? d.content : "";
        if (delta) {
          full += delta;
          options?.onChunk(delta);
        }
      } catch {
        /* 忽略非 JSON 行 */
      }
    }
  }

  return full;
}

/** 从 LLM 输出中安全提取 JSON（容忍 markdown 代码块包裹） */
export function parseJsonFromLlm<T>(content: string): T {
  // 去除可能的 ```json ... ``` 包裹
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  let raw = fenced ? fenced[1] : content;
  // 找到第一个 { 和最后一个 } 之间的内容
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM output contains no JSON object");
  }
  raw = raw.slice(start, end + 1);
  // 容错：去掉尾随逗号（LLM 常见错误），并修复数组/对象间缺逗号的情况
  raw = raw.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(raw) as T;
}
