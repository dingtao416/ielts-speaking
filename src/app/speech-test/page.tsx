"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Waves } from "lucide-react";

import { Button } from "@/components/ui/button";

type PermissionStateLabel = "prompt" | "granted" | "denied" | "unknown";

type LogEntry = {
  id: number;
  at: string;
  message: string;
};

type DetailedSpeechRecognition = SpeechRecognition & {
  onaudiostart: ((event: Event) => void) | null;
  onaudioend: ((event: Event) => void) | null;
  onsoundstart: ((event: Event) => void) | null;
  onsoundend: ((event: Event) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
  onspeechend: ((event: Event) => void) | null;
  onnomatch: ((event: Event) => void) | null;
};

function getRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

export default function SpeechTestPage() {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const logIdRef = useRef(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [permission, setPermission] =
    useState<PermissionStateLabel>("unknown");
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [hasRecognition, setHasRecognition] = useState(false);
  const [hasGetUserMedia, setHasGetUserMedia] = useState(false);
  const [isSecureContext, setIsSecureContext] = useState(false);

  const addLog = useCallback((message: string) => {
    logIdRef.current += 1;
    setLogs((previous) => [
      {
        id: logIdRef.current,
        at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        message,
      },
      ...previous,
    ]);
  }, []);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    try {
      recognition.stop();
      addLog("已调用 recognition.stop()");
    } catch (error) {
      addLog(`调用 recognition.stop() 失败：${String(error)}`);
    }
  }, [addLog]);

  useEffect(() => {
    const supported = Boolean(getRecognitionConstructor());
    setHasRecognition(supported);
    setHasGetUserMedia(Boolean(navigator.mediaDevices?.getUserMedia));
    setIsSecureContext(window.isSecureContext);

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((status) => {
          setPermission(status.state as PermissionStateLabel);
          status.onchange = () =>
            setPermission(status.state as PermissionStateLabel);
        })
        .catch(() => setPermission("unknown"));
    }

    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // The browser may have already ended this recognition session.
      }
    };
  }, []);

  const requestMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      addLog("浏览器没有提供 navigator.mediaDevices.getUserMedia");
      return;
    }

    addLog("请求 getUserMedia({ audio: true })");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setPermission("granted");
      addLog("getUserMedia 成功，音频轨道已释放");
    } catch (error) {
      addLog(
        `getUserMedia 失败：${error instanceof DOMException ? error.name : String(error)}`,
      );
    }
  }, [addLog]);

  const startRecognition = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      addLog("浏览器未提供 SpeechRecognition 或 webkitSpeechRecognition");
      return;
    }

    try {
      recognitionRef.current?.abort();
    } catch {
      // A previous session may already be closed.
    }

    const recognition = new Recognition() as DetailedSpeechRecognition;
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      addLog("事件：start");
    };
    recognition.onaudiostart = () => addLog("事件：audiostart（识别器已开始采集音频）");
    recognition.onaudioend = () => addLog("事件：audioend（识别器已停止采集音频）");
    recognition.onsoundstart = () => addLog("事件：soundstart（检测到声音）");
    recognition.onsoundend = () => addLog("事件：soundend（声音结束）");
    recognition.onspeechstart = () => addLog("事件：speechstart（检测到语音）");
    recognition.onspeechend = () => addLog("事件：speechend（语音结束）");
    recognition.onnomatch = () => addLog("事件：nomatch（服务未匹配到识别结果）");
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      const text = result?.[0]?.transcript.trim() ?? "";
      if (text) setTranscript(text);
      addLog(`事件：result (${result?.isFinal ? "final" : "interim"})：${text || "空结果"}`);
    };
    recognition.onerror = (event) => {
      addLog(`事件：error，error = ${event.error}，message = ${event.message || "无"}`);
    };
    recognition.onend = () => {
      setIsListening(false);
      addLog("事件：end");
    };

    setTranscript("");
    addLog("直接调用 recognition.start()，未执行 getUserMedia 预检");
    try {
      recognition.start();
    } catch (error) {
      addLog(`recognition.start() 同步失败：${String(error)}`);
    }
  }, [addLog]);

  const browserInfo = typeof navigator === "undefined" ? "" : navigator.userAgent;

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-medium text-secondary-text">浏览器语音识别诊断</p>
        <h1 className="mt-2 text-2xl font-semibold">原生 SpeechRecognition 测试</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary-text">
          此页不使用项目的语音 Hook，也不会请求项目后端。它直接调用浏览器提供的 Web Speech API，并记录浏览器返回的原始事件。
        </p>

        <section className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          <InfoRow label="安全上下文" value={isSecureContext ? "是" : "否"} />
          <InfoRow label="语音识别 API" value={hasRecognition ? "可用" : "不可用"} />
          <InfoRow label="麦克风权限" value={permission} />
          <InfoRow label="getUserMedia" value={hasGetUserMedia ? "可用" : "不可用"} />
        </section>

        <section className="mt-6 flex flex-wrap gap-3" aria-label="诊断操作">
          <Button variant="secondary" onClick={requestMicrophone}>
            <Mic className="h-4 w-4" aria-hidden="true" />
            请求麦克风权限
          </Button>
          <Button onClick={startRecognition} disabled={!hasRecognition || isListening}>
            <Waves className="h-4 w-4" aria-hidden="true" />
            直接开始语音识别
          </Button>
          <Button variant="secondary" onClick={stopRecognition} disabled={!isListening}>
            <Square className="h-4 w-4" aria-hidden="true" />
            停止
          </Button>
        </section>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="text-sm font-medium">最近识别结果</h2>
          <p className="mt-2 min-h-12 whitespace-pre-wrap text-sm leading-6 text-secondary-text">
            {transcript || "尚无结果"}
          </p>
        </section>

        <section className="mt-6 border-t border-border pt-6">
          <h2 className="text-sm font-medium">事件记录</h2>
          <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs leading-5 text-secondary-text">
            {logs.length === 0 ? (
              <p>等待操作</p>
            ) : (
              <ol className="space-y-1">
                {logs.map((entry) => (
                  <li key={entry.id}>
                    <time className="mr-2 text-tertiary-text">{entry.at}</time>
                    {entry.message}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section className="mt-6 border-t border-border pt-6">
          <h2 className="text-sm font-medium">浏览器标识</h2>
          <p className="mt-2 break-all font-mono text-xs leading-5 text-secondary-text">
            {browserInfo}
          </p>
        </section>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-background px-4 py-3 text-sm">
      <span className="text-secondary-text">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
