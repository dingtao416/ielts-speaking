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

export async function chatComplete(
  messages: LlmMessage[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const config = resolveEndpoint();
  if (!config) {
    throw new Error("LLM provider is not configured on the server.");
  }

  const response = await fetch(config.url, {
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
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LLM request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const content: string | undefined =
    message?.content || message?.reasoning_content;
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
  },
): Promise<string> {
  const config = resolveEndpoint();
  if (!config) {
    throw new Error("LLM provider is not configured on the server.");
  }

  const response = await fetch(config.url, {
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
  });

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
        const delta =
          parsed?.choices?.[0]?.delta?.content ||
          parsed?.choices?.[0]?.delta?.reasoning_content;
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
