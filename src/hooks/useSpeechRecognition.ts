"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechState =
  | "idle"
  | "listening"
  | "paused"
  | "error"
  | "unsupported";

export type SpeechError =
  | "permission-denied"
  | "microphone-unavailable"
  | "recognition-network"
  | "start-failed";

type SpeechRecognitionResult = {
  text: string;
  isFinal: boolean;
};

interface SpeechRecognitionApi {
  state: SpeechState;
  supported: boolean;
  error: SpeechError | null;
  unsupportedReason: "insecure-context" | "not-supported" | null;
  micPermission: "prompt" | "granted" | "denied" | "unknown";
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  setOnResult: (handler: (result: SpeechRecognitionResult) => void) => void;
}

export function speechErrorMessageKey(error: SpeechError) {
  switch (error) {
    case "permission-denied":
      return "practice.micDenied";
    case "microphone-unavailable":
      return "practice.micUnavailable";
    case "recognition-network":
      return "practice.micNetwork";
    case "start-failed":
      return "practice.micStartFailed";
  }
}

/**
 * Web Speech API 封装（浏览器原生，无需音频上传）。
 * Chrome/Edge 最佳；lang 默认 en-US（雅思）。
 */
export function useSpeechRecognition(lang = "en-US"): SpeechRecognitionApi {
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState<SpeechError | null>(null);
  const recognitionRef = useRef<any>(null);
  const startingRef = useRef(false);
  const supportedRef = useRef<boolean>(false);
  const listeningRef = useRef<boolean>(false);
  const pausedRef = useRef<boolean>(false);
  const langRef = useRef(lang);
  const onResultRef = useRef<(result: SpeechRecognitionResult) => void>(
    () => {},
  );
  // 记录最近一次错误类型（用于 onend 重连时判断是否需要退避）
  const lastErrorRef = useRef<string | null>(null);
  const networkErrorCountRef = useRef(0);
  const terminalErrorRef = useRef(false);
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
      return null;
    }

    const recognition = new Recognition();
    recognition.lang = langRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      if (recognitionRef.current !== recognition) {
        return;
      }
      if (pausedRef.current) {
        return;
      }
      networkErrorCountRef.current = 0;
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
      if (recognitionRef.current !== recognition) {
        return;
      }
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }

      const fail = (type: SpeechError) => {
        terminalErrorRef.current = true;
        listeningRef.current = false;
        pausedRef.current = false;
        setError(type);
        setState("error");
      };

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicPermission("denied");
        fail("permission-denied");
        return;
      }
      if (event.error === "audio-capture") {
        fail("microphone-unavailable");
        return;
      }
      if (event.error === "network") {
        // 网络类错误：连续多次才判失败，给 onend 的重连留出恢复机会
        networkErrorCountRef.current += 1;
        if (networkErrorCountRef.current >= 3) {
          fail("recognition-network");
          return;
        }
        lastErrorRef.current = "network";
        return;
      }
      if (event.error === "language-not-supported") {
        fail("start-failed");
        return;
      }
      console.error("[ASR] error:", event.error);
      fail("start-failed");
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) {
        return;
      }
      if (terminalErrorRef.current) {
        return;
      }
      // 仍在录音且未暂停 → 自动重连（带退避，避免 network 死循环）
      if (listeningRef.current && !pausedRef.current) {
        const backoff = lastErrorRef.current === "network" ? 800 : 100;
        lastErrorRef.current = null;
        window.setTimeout(() => {
          if (
            recognitionRef.current !== recognition ||
            !listeningRef.current ||
            pausedRef.current
          ) {
            return;
          }
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

  // 语言改变：无论是否在录音，都让识别实例用新语言。
  // 正在录音时重建实例并重启；否则仅更新 ref，下次 start 用新语言。
  useEffect(() => {
    langRef.current = lang;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (recognition.lang === lang) return;
    if (!listeningRef.current) {
      // 未在录音：只更新现有实例的 lang，下次 start 会基于 langRef 新建
      try {
        recognition.lang = lang;
      } catch {
        /* ignore */
      }
      return;
    }
    // 正在录音：用新语言重建实例并重启
    recognitionRef.current = null;
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    const replacement = createRecognition();
    if (!replacement) return;
    recognitionRef.current = replacement;
    replacement.lang = lang;
    try {
      replacement.start();
      setState("listening");
    } catch {
      /* ignore */
    }
  }, [lang, createRecognition]);

  const start = useCallback(() => {
    if (startingRef.current) {
      return;
    }
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setState("unsupported");
      return;
    }

    startingRef.current = true;
    try {
      setError(null);
      terminalErrorRef.current = false;
      listeningRef.current = false;
      pausedRef.current = false;
      lastErrorRef.current = null;
      networkErrorCountRef.current = 0;

      // 在点击事件内直接启动识别。getUserMedia 的异步预检会改变用户手势时机，
      // 而 SpeechRecognition 会自行请求同一麦克风权限。
      const previous = recognitionRef.current;
      recognitionRef.current = null;
      try {
        previous?.stop();
      } catch {
        /* ignore */
      }
      const recognition = createRecognition();
      if (!recognition) return;
      recognitionRef.current = recognition;
      try {
        listeningRef.current = true;
        recognition.start();
        setState("listening");
      } catch (err: any) {
        if (err?.name === "InvalidStateError") {
          // 已在运行，忽略
          setState("listening");
          return;
        }
        terminalErrorRef.current = true;
        listeningRef.current = false;
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        setError("start-failed");
        setState("error");
      }
    } finally {
      startingRef.current = false;
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
    terminalErrorRef.current = false;
    listeningRef.current = false;
    pausedRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      /* ignore */
    }
    setState("idle");
  }, []);

  const reset = useCallback(() => {
    terminalErrorRef.current = false;
    listeningRef.current = false;
    pausedRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      /* ignore */
    }
    networkErrorCountRef.current = 0;
    lastErrorRef.current = null;
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
