"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechState =
  | "idle"
  | "listening"
  | "paused"
  | "error"
  | "unsupported";

type SpeechRecognitionResult = {
  text: string;
  isFinal: boolean;
};

interface SpeechRecognitionApi {
  state: SpeechState;
  supported: boolean;
  error: string | null;
  unsupportedReason: "insecure-context" | "not-supported" | null;
  micPermission: "prompt" | "granted" | "denied" | "unknown";
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  setOnResult: (handler: (result: SpeechRecognitionResult) => void) => void;
}

/**
 * Web Speech API 封装（浏览器原生，无需音频上传）。
 * Chrome/Edge 最佳；lang 默认 en-US（雅思）。
 */
export function useSpeechRecognition(lang = "en-US"): SpeechRecognitionApi {
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const supportedRef = useRef<boolean>(false);
  const listeningRef = useRef<boolean>(false);
  const pausedRef = useRef<boolean>(false);
  const langRef = useRef(lang);
  const onResultRef = useRef<(result: SpeechRecognitionResult) => void>(
    () => {},
  );
  // 记录最近一次错误类型（用于 onend 重连时判断是否需要退避）
  const lastErrorRef = useRef<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [unsupportedReason, setUnsupportedReason] = useState<
    "insecure-context" | "not-supported" | null
  >(null);
  // 麦克风权限状态（仅探测，不申请）
  const [micPermission, setMicPermission] = useState<
    "prompt" | "granted" | "denied" | "unknown"
  >("unknown");

  // 检测浏览器支持
  useEffect(() => {
    const Recognition =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    supportedRef.current = Boolean(Recognition);
    setSupported(Boolean(Recognition));

    // 区分：非安全上下文（HTTP 非 localhost）vs 浏览器真不支持
    if (!Recognition) {
      const isSecure =
        typeof window !== "undefined" &&
        (window.isSecureContext || location.protocol === "https:" ||
          location.hostname === "localhost" || location.hostname === "127.0.0.1");
      setUnsupportedReason(isSecure ? "not-supported" : "insecure-context");
    } else {
      setUnsupportedReason(null);

      // 探测麦克风权限状态（不触发申请弹窗）
      if (navigator.permissions?.query) {
        navigator.permissions
          .query({ name: "microphone" as PermissionName })
          .then((status) => {
            setMicPermission(status.state as "prompt" | "granted" | "denied");
            status.onchange = () =>
              setMicPermission(status.state as "prompt" | "granted" | "denied");
          })
          .catch(() => setMicPermission("unknown"));
      }
    }
  }, []);

  // 更新 lang（createRecognition 定义之后有对应重启逻辑）
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const setOnResult = useCallback(
    (handler: (result: SpeechRecognitionResult) => void) => {
      onResultRef.current = handler;
    },
    [],
  );

  const createRecognition = useCallback(() => {
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setState("unsupported");
      setError("Speech recognition not supported in this browser.");
      return null;
    }

    const recognition = new Recognition();
    recognition.lang = langRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      if (pausedRef.current) {
        return;
      }
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) {
        onResultRef.current({ text: final, isFinal: true });
      }
      if (interim) {
        onResultRef.current({ text: interim, isFinal: false });
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission denied. Check browser settings.");
        setState("error");
        return;
      }
      // network / service-not-allowed 等服务端问题：记录错误，交给 onend 的重连逻辑
      // 自动重连会带退避，避免无限快速重启
      if (event.error === "network") {
        // onend 会触发重连；这里标记一下以便重连逻辑知道是网络问题
        lastErrorRef.current = "network";
        return;
      }
      console.error("[ASR] error:", event.error);
    };

    recognition.onend = () => {
      // 仍在录音且未暂停 → 自动重连（带退避，避免 network 死循环）
      if (listeningRef.current && !pausedRef.current) {
        // 网络类错误：延迟重连，逐步退避
        const backoff = lastErrorRef.current === "network" ? 800 : 100;
        lastErrorRef.current = null;
        window.setTimeout(() => {
          if (!listeningRef.current || pausedRef.current) return;
          try {
            recognition.start();
          } catch {
            /* ignore */
          }
        }, backoff);
      } else if (listeningRef.current && pausedRef.current) {
        // 暂停时停在 paused
      } else {
        setState("idle");
      }
    };

    return recognition;
  }, []);

  // 语言改变且正在录音时，用新语言重建实例并重启
  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (recognition.lang === lang) return;
    if (!listeningRef.current) return;
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = createRecognition();
    recognitionRef.current.lang = lang;
    try {
      recognitionRef.current.start();
      setState("listening");
    } catch {
      /* ignore */
    }
  }, [lang, createRecognition]);

  const start = useCallback(() => {
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setState("unsupported");
      return;
    }

    setError(null);
    listeningRef.current = true;
    pausedRef.current = false;
    lastErrorRef.current = null; // 手动开始是全新会话，重置错误标记

    // 每次 start 都重建实例：彻底规避"上次权限被拒后实例状态卡住"的问题。
    // 浏览器是否重新弹权限窗由它自己的缓存决定（拒绝过的站点不会重弹），
    // 但我们至少确保每次调用都是干净的全新实例。
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = createRecognition();
    try {
      recognitionRef.current?.start();
      setState("listening");
    } catch (err: any) {
      if (err?.name === "InvalidStateError") {
        // 已在运行，忽略
        setState("listening");
        return;
      }
      setError(err?.message || "Failed to start speech recognition.");
      setState("error");
    }
  }, [createRecognition]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    try {
      recognitionRef.current?.start();
      setState("listening");
    } catch {
      /* ignore */
    }
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    pausedRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setState("idle");
  }, []);

  const reset = useCallback(() => {
    listeningRef.current = false;
    pausedRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setError(null);
    setState("idle");
  }, []);

  return {
    state,
    supported,
    error,
    unsupportedReason,
    micPermission,
    start,
    pause,
    resume,
    stop,
    reset,
    setOnResult,
  };
}
