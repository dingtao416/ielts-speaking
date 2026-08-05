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
  const stateRef = useRef<SpeechState>("idle");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const supportedRef = useRef<boolean>(false);
  const listeningRef = useRef<boolean>(false);
  const pausedRef = useRef<boolean>(false);
  const langRef = useRef(lang);
  const onResultRef = useRef<(result: SpeechRecognitionResult) => void>(
    () => {},
  );
  const [supported, setSupported] = useState(false);
  const [unsupportedReason, setUnsupportedReason] = useState<
    "insecure-context" | "not-supported" | null
  >(null);

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
    }
  }, []);

  // 更新 lang
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
      console.error("[ASR] error:", event.error);
    };

    recognition.onend = () => {
      // 自动重启（仍在录音且未暂停）
      if (listeningRef.current && !pausedRef.current) {
        try {
          recognition.start();
        } catch {
          /* ignore */
        }
      } else if (listeningRef.current && pausedRef.current) {
        // 暂停时停在 paused
      } else {
        setState("idle");
      }
    };

    return recognition;
  }, []);

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

    // 若上一次实例失败（如权限被拒后重建），重新创建以重新触发权限请求
    if (!recognitionRef.current) {
      recognitionRef.current = createRecognition();
    } else if (stateRef.current === "error" || stateRef.current === "unsupported") {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = createRecognition();
    }
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
    start,
    pause,
    resume,
    stop,
    reset,
    setOnResult,
  };
}
