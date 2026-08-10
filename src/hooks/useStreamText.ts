"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 流式文本读取 hook：消费 SSE 响应，逐块累积文本。
 * 用于报告流式渲染。
 */
export function useStreamText() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const reset = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setText("");
    setStatus("idle");
    setError(null);
  };

  const stream = async (url: string, body: Record<string, unknown>) => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setText("");
    setError(null);
    setStatus("streaming");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controllerRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Request failed with ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 按 SSE 事件行拆分（data: ...）
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") {
              setStatus("done");
              continue;
            }
            setText((prev) => prev + payload);
          }
        }
      }
      setStatus("done");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return;
      }
      setError(err?.message || "Stream failed");
      setStatus("error");
    }
  };

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  return { text, status, error, stream, reset };
}
