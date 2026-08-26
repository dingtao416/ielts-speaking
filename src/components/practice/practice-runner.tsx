"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Loader2,
  Mic,
  RotateCcw,
  Square,
  SkipForward,
} from "lucide-react";

import { speechErrorMessageKey, useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useCountdown } from "@/hooks/useTimer";
import { highlightVagueOnly, langFromAsr } from "@/lib/lexicon";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settingsStore";
import { DIMENSION_LABELS, DIMENSION_LABELS_EN } from "@/lib/profile";
import { getAudio, saveAudio } from "@/lib/local-audio";
import { track } from "@/lib/analytics";
import type { VocabularyHighlight, SessionSummary } from "@/persistence/schema";
import { Button, buttonClass } from "@/components/ui/button";
import { AudioPlayback } from "@/components/ui/audio-playback";

/** 每题录音时长（秒，PRD 固定 30 秒） */
const RECORD_SECONDS = 30;

type Phase =
  | "loading"
  | "question"
  | "recording"
  | "confirm"
  | "feedback"
  | "summary"
  | "diagnostic-result";

interface DeliveryDto {
  id: string;
  orderNo: number;
  questionId: string;
  textSnapshot: string;
  topic: string;
}

interface AttemptDto {
  id: string;
  sessionId: string;
  questionDeliveryId: string;
  audioRef: string | null;
  finalTranscript: string;
  durationSec: number;
  endedBy: string;
  feedback?: {
    status: string;
    vocabularyHighlights: VocabularyHighlight[];
    naturalRewrite: string | null;
    activeStageBand: string | null;
  } | null;
}

interface SessionDto {
  id: string;
  mode: "personal_background" | "standard_topic";
  topicSetKey: string;
  bankVersion: string;
  diagnosticEligible: boolean;
  status: string;
  summary: SessionSummary | null;
}

type FeedbackStatus =
  | "idle"
  | "loading"
  | "streaming"
  | "ok"
  | "degraded";

interface DiagnosticResult {
  bandEvidence: {
    dimensions: {
      fluency: number | null;
      lexical: number | null;
      grammar: number | null;
      pronunciation: number | null;
    };
    overall: number;
    notes: string[];
  };
  currentBand: number;
  finalGoalBand: number;
  activeStageBand: number;
  stagePlan: string[];
}

interface FeedbackState {
  status: FeedbackStatus;
  vocab: VocabularyHighlight[];
  rewrite: string;
  activeStageBand: number | null;
  error: string | null;
}

function uid() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** V1 共用练习运行器：固定问题 → 录音 → 转写确认 → 表达反馈 → 下一题（冻结顺序） */
export function PracticeRunner({ sessionId }: { sessionId: string }) {
  const { t, locale } = useT();
  const router = useRouter();
  const asrLang = useSettingsStore((s) => s.asrLang);
  const speech = useSpeechRecognition(asrLang);

  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [session, setSession] = useState<SessionDto | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryDto[]>([]);
  const [attempts, setAttempts] = useState<AttemptDto[]>([]);

  // 当前题
  const [deliveryIndex, setDeliveryIndex] = useState(0);
  const [liveText, setLiveText] = useState("");
  const liveTextRef = useRef("");
  const [endedBy, setEndedBy] = useState<"manual" | "timeout" | "asr_failed">("manual");
  const [saving, setSaving] = useState(false);
  const [savedAttempt, setSavedAttempt] = useState<AttemptDto | null>(null);

  // 反馈
  const [feedback, setFeedback] = useState<FeedbackState>({
    status: "idle",
    vocab: [],
    rewrite: "",
    activeStageBand: null,
    error: null,
  });
  const [summaryData, setSummaryData] = useState<SessionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);

  // 录音
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const objectUrlsRef = useRef<string[]>([]);

  const countdown = useCountdown(RECORD_SECONDS, () => {
    setEndedBy("timeout");
    void endAnswer("timeout");
  });

  const currentDelivery = deliveries[deliveryIndex] ?? null;
  const isFamiliar = session?.mode === "personal_background";

  // 埋点：题目展示（每次切换到一道题）
  useEffect(() => {
    if (phase === "loading" || phase === "summary" || phase === "diagnostic-result") return;
    if (currentDelivery) {
      track("question_shown", {
        mode: session?.mode,
        orderNo: currentDelivery.orderNo,
        total: deliveries.length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryIndex, phase, currentDelivery?.id]);

  // ===== 会话加载 / 恢复（刷新后冻结序列不变）=====
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/practice-sessions/${sessionId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "load failed");
        return data as {
          session: SessionDto;
          deliveries: DeliveryDto[];
          attempts: AttemptDto[];
        };
      })
      .then((data) => {
        if (cancelled) return;
        setSession(data.session);
        setDeliveries(data.deliveries);
        setAttempts(data.attempts);
        setSummaryData(data.session.summary ?? null);
        const firstUnanswered = data.deliveries.findIndex(
          (d) => !data.attempts.some((a) => a.questionDeliveryId === d.id),
        );
        setDeliveryIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
        if (data.session.status === "completed" || firstUnanswered === -1) {
          setPhase("summary");
        } else {
          setPhase("question");
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 卸载时释放录音流与 object URL（录音流可能在录音中才创建）
  useEffect(() => {
    const urls = objectUrlsRef.current;
    const stream = audioStreamRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  // 实时转写
  useEffect(() => {
    if (phase !== "recording") return;
    const handler = (result: { text: string; isFinal: boolean }) => {
      if (result.isFinal) {
        liveTextRef.current = liveTextRef.current
          ? `${liveTextRef.current} ${result.text}`
          : result.text;
        setLiveText(liveTextRef.current);
      } else {
        setLiveText(
          liveTextRef.current
            ? `${liveTextRef.current} ${result.text}`
            : result.text,
        );
      }
    };
    speech.setOnResult(handler);
    return () => {
      speech.setOnResult(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, deliveryIndex]);

  // ASR 失败 → 停止录音并进入确认页（允许手动补写）
  useEffect(() => {
    if (speech.error && phase === "recording") {
      countdown.resetCountdown();
      setEndedBy("asr_failed");
      stopRecordingOnly();
      setPhase("confirm");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.error, phase]);

  // ===== 录音 =====
  async function startAudioRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
    } catch {
      /* 忽略：无音频也能练习（手动补写） */
    }
  }

  function stopRecordingOnly() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      audioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      audioStreamRef.current = null;
      mediaRecorderRef.current = null;
      return;
    }
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      const key = uid();
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.push(url);
      void saveAudio(key, blob).catch(() => {
        /* 本地存储失败不阻塞 */
      });
      pendingAudioKeyRef.current = key;
      audioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      audioStreamRef.current = null;
      mediaRecorderRef.current = null;
    };
    try {
      recorder.stop();
    } catch {
      audioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      audioStreamRef.current = null;
      mediaRecorderRef.current = null;
    }
  }

  const pendingAudioKeyRef = useRef<string | null>(null);

  function handleStart() {
    setLiveText("");
    liveTextRef.current = "";
    pendingAudioKeyRef.current = null;
    setEndedBy("manual");
    track("recording_started", { orderNo: currentDelivery?.orderNo });
    void startAudioRecording();
    speech.start();
    countdown.startCountdown();
    setPhase("recording");
  }

  async function endAnswer(ended: "manual" | "timeout") {
    if (phase !== "recording") return;
    speech.stop();
    countdown.resetCountdown();
    setEndedBy(ended);
    track("recording_ended", { endedBy: ended });
    stopRecordingOnly();
    setPhase("confirm");
  }

  // ===== 确认 / 保存 =====
  async function confirmAndSave() {
    if (!session || !currentDelivery || saving) return;
    const text = liveTextRef.current.trim();
    setSaving(true);
    try {
      const res = await fetch("/api/response-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          deliveryId: currentDelivery.id,
          finalTranscript: text,
          durationSec: RECORD_SECONDS,
          endedBy: text ? endedBy : "manual_input",
          audioRef: pendingAudioKeyRef.current ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "save failed");
      setSavedAttempt(data.attempt);
      setAttempts((prev) => [...prev, data.attempt]);
      setPhase("feedback");
      track("transcript_confirmed", {
        mode: session.mode,
        endedBy: data.attempt.endedBy,
        words: text.split(/\s+/).filter(Boolean).length,
      });
      setFeedback({
        status: "idle",
        vocab: [],
        rewrite: "",
        activeStageBand: null,
        error: null,
      });
      if (data.attempt.endedBy !== "skipped" && text) {
        void requestFeedback(data.attempt.id);
      }
    } catch (e: any) {
      setLoadError(e?.message ?? "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function skipQuestion() {
    if (!session || !currentDelivery || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/response-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          deliveryId: currentDelivery.id,
          finalTranscript: "",
          durationSec: 0,
          endedBy: "skipped",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "save failed");
      setAttempts((prev) => [...prev, data.attempt]);
      if (deliveryIndex < deliveries.length - 1) {
        setDeliveryIndex((i) => i + 1);
        setPhase("question");
      } else {
        void finishPractice();
      }
    } catch (e: any) {
      setLoadError(e?.message ?? "save failed");
    } finally {
      setSaving(false);
    }
  }

  // ===== 反馈（SSE：meta → text* → done/error）=====
  async function requestFeedback(attemptId: string) {
    setFeedback({
      status: "loading",
      vocab: [],
      rewrite: "",
      activeStageBand: null,
      error: null,
    });
    try {
      const res = await fetch("/api/response-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      if (!res.ok || !res.body) throw new Error("feedback request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let rewrite = "";
      let latestVocab: VocabularyHighlight[] = [];

      const applyEvent = (event: {
        type: string;
        vocabularyHighlights?: VocabularyHighlight[];
        activeStageBand?: number;
        text?: string;
        status?: string;
        message?: string;
      }) => {
        if (event.type === "meta") {
          latestVocab = event.vocabularyHighlights ?? [];
          setFeedback((prev) => ({
            ...prev,
            status: "streaming",
            vocab: latestVocab,
            activeStageBand: event.activeStageBand ?? null,
          }));
        } else if (event.type === "text") {
          rewrite += event.text ?? "";
          setFeedback((prev) => ({ ...prev, rewrite }));
        } else if (event.type === "done") {
          setFeedback((prev) => ({
            ...prev,
            status: "ok",
            rewrite: prev.rewrite || rewrite,
          }));
          track("response_feedback_ready", {
            mode: session?.mode,
            vocabCount: latestVocab.length,
          });
        } else if (event.type === "error") {
          setFeedback((prev) => ({
            ...prev,
            status: "degraded",
            error: event.message ?? "feedback failed",
          }));
          track("feedback_unavailable", { attemptId });
        }
      };

      for (;;) {
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
            applyEvent(JSON.parse(payload));
          } catch {
            /* 忽略坏事件 */
          }
        }
      }
    } catch (e: any) {
      setFeedback({
        status: "degraded",
        vocab: [],
        rewrite: "",
        activeStageBand: null,
        error: e?.message ?? "feedback failed",
      });
    }
  }

  // ===== 下一题 / 完成 =====
  function handleNext() {
    pendingAudioKeyRef.current = null;
    track("question_completed", {
      mode: session?.mode,
      orderNo: currentDelivery?.orderNo,
    });
    if (deliveryIndex < deliveries.length - 1) {
      setDeliveryIndex((i) => i + 1);
      setPhase("question");
    } else {
      void finishPractice();
    }
  }

  async function finishPractice() {
    if (!session) return;
    setPhase("summary");
    setSummaryLoading(true);
    try {
      if (session.topicSetKey === "diagnostic") {
        // 诊断会话：完成 8 题后生成诊断档案（FR-009）
        const res = await fetch("/api/diagnostic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "diagnostic failed");
        setDiagnosticResult(data.assessment);
        setPhase("diagnostic-result");
        track("diagnostic_completed", { sessionId: session.id });
        track("session_completed", { mode: session.mode, diagnostic: true });
        return;
      }
      if (session.mode === "standard_topic") {
        // 标准话题：生成训练用途预估并完成会话（D-3）
        const res = await fetch("/api/topic-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "summary failed");
        setSummaryData(data.summary);
        track("session_completed", { mode: session.mode });
      } else {
        // 熟悉话题：不生成 Band/预估，直接完结（FR-008）
        await fetch(`/api/practice-sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
        track("session_completed", { mode: session.mode });
      }
    } catch {
      // 总结失败不阻塞完结：熟悉话题补发完结；标准话题/诊断保留 in_progress 可重试
      if (session.mode === "personal_background") {
        await fetch(`/api/practice-sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        }).catch(() => {});
      }
    } finally {
      setSummaryLoading(false);
    }
  }

  async function repractice() {
    if (!session) return;
    track("repractice_started", { mode: session.mode, topicSetKey: session.topicSetKey });
    const res = await fetch("/api/practice-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: session.mode,
        topicSetKey: session.topicSetKey,
      }),
    });
    const data = await res.json();
    if (res.ok && data.session) {
      router.push(`/practice/session/${data.session.id}`);
    }
  }

  // 复盘音频回放
  const [reviewAudioUrl, setReviewAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== "feedback" || !savedAttempt?.audioRef) return;
    let url: string | null = null;
    let cancelled = false;
    getAudio(savedAttempt.audioRef)
      .then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        setReviewAudioUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) {
        URL.revokeObjectURL(url);
        setReviewAudioUrl(null);
      }
    };
  }, [phase, savedAttempt]);

  // ===== 渲染 =====
  if (loadError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 py-16 text-center">
        <p className="text-sm text-[var(--danger-color)]" role="alert">
          {t("v1.session.loadError")}: {loadError}
        </p>
        <Link href="/practice" className={buttonClass("secondary", "md")}>
          {t("v1.home.title")}
        </Link>
      </div>
    );
  }

  if (phase === "loading" || !session || !currentDelivery) {
    return (
      <div className="flex justify-center py-16 text-secondary-text">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  const total = deliveries.length;
  const index = deliveryIndex + 1;
  const topicLabel = currentDelivery.topic;

  // ===== 问题与思考 =====
  if (phase === "question") {
    return (
      <Shell topic={topicLabel}>
        <section className="flex flex-col gap-6 rounded-2xl border border-border p-6">
          <Meta index={index} total={total} topic={topicLabel} mode={session.mode} />
          <h1 className="text-3xl font-semibold leading-tight">
            {currentDelivery.textSnapshot}
          </h1>
          <p className="text-sm text-tertiary-text">{t("v1.session.thinkHint")}</p>

          <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-secondary-text">
                {t("v1.session.ready")}
              </h3>
              <span
                className="font-mono text-2xl font-bold tabular-nums"
                role="timer"
                aria-label={t("v1.session.aria.timer", { seconds: RECORD_SECONDS })}
              >
                00:{String(RECORD_SECONDS).padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button size="lg" onClick={handleStart}>
                <Mic className="h-5 w-5" aria-hidden="true" />
                {t("v1.session.startRecording")}
              </Button>
            </div>
          </div>

          {speech.error && speech.state === "error" ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 rounded-xl border border-[var(--danger-color)]/30 bg-[var(--danger-color)]/5 p-4"
            >
              <p className="text-sm leading-relaxed text-[var(--danger-color)]">
                {t("v1.session.micError", { message: t(speechErrorMessageKey(speech.error)) })}
              </p>
              <Button variant="secondary" size="sm" onClick={handleStart}>
                {t("common.retry")}
              </Button>
            </div>
          ) : null}
        </section>
      </Shell>
    );
  }

  // ===== 正在录音 =====
  if (phase === "recording") {
    return (
      <Shell topic={topicLabel}>
        <section className="flex flex-col gap-6 rounded-2xl border border-border p-6">
          <Meta index={index} total={total} topic={topicLabel} mode={session.mode} />
          <h1 className="text-3xl font-semibold leading-tight">
            {currentDelivery.textSnapshot}
          </h1>

          <div
            className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-5"
            aria-label="Active recording and live transcript"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-secondary-text">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--recording-color)]"
                  aria-hidden="true"
                />
                {t("v1.session.recording")}
              </h3>
              <span
                className="font-mono text-3xl font-bold tabular-nums"
                role="timer"
                aria-label={t("v1.session.aria.timer", { seconds: countdown.remaining })}
              >
                00:{String(countdown.remaining).padStart(2, "0")}
              </span>
            </div>
            <p className="text-sm text-tertiary-text">{t("v1.session.liveHint")}</p>

            <div
              className="min-h-[120px] rounded-lg border border-border bg-background p-4 text-lg leading-relaxed"
              aria-live="polite"
            >
              {liveText ? (
                <p
                  dangerouslySetInnerHTML={{
                    __html: highlightVagueOnly(liveText, langFromAsr(asrLang)),
                  }}
                />
              ) : (
                <p className="text-tertiary-text">{t("v1.session.waitingTranscript")}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button size="lg" variant="danger" onClick={() => void endAnswer("manual")}>
                <Square className="h-5 w-5" aria-hidden="true" />
                {t("v1.session.endAnswer")}
              </Button>
              <span className="text-sm text-tertiary-text">{t("v1.session.autoStop")}</span>
            </div>
          </div>
        </section>
      </Shell>
    );
  }

  // ===== 转写确认（FR-005）=====
  if (phase === "confirm") {
    const empty = !liveTextRef.current.trim();
    return (
      <Shell topic={topicLabel}>
        <section className="flex flex-col gap-6 rounded-2xl border border-border p-6">
          <Meta index={index} total={total} topic={topicLabel} mode={session.mode} />
          <h1 className="text-xl font-semibold">{currentDelivery.textSnapshot}</h1>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-secondary-text">
              {t("v1.session.confirmTitle")}
            </h2>
            <p className="text-xs text-tertiary-text">{t("v1.session.confirmDesc")}</p>
            <textarea
              value={liveTextRef.current}
              onChange={(e) => {
                liveTextRef.current = e.target.value;
                setLiveText(e.target.value);
              }}
              rows={5}
              aria-label={t("v1.session.confirmTitle")}
              className="w-full resize-y rounded-xl border border-border bg-background p-4 text-lg leading-relaxed focus:border-foreground focus:outline-none"
            />
            {empty ? (
              <p className="text-xs text-tertiary-text">{t("v1.session.manualHint")}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                speech.stop();
                pendingAudioKeyRef.current = null;
                setPhase("question");
              }}
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t("v1.session.retry")}
            </Button>
            <Button variant="secondary" onClick={() => void skipQuestion()} disabled={saving}>
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              {t("v1.session.skip")}
            </Button>
            <Button onClick={() => void confirmAndSave()} disabled={saving || empty}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              {t("v1.session.confirmAndSave")}
            </Button>
          </div>
        </section>
      </Shell>
    );
  }

  // ===== 表达反馈（FR-006/007）=====
  if (phase === "feedback") {
    const generating = feedback.status === "loading" || feedback.status === "streaming";
    return (
      <Shell topic={topicLabel}>
        <section className="flex flex-col gap-6 rounded-2xl border border-border p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {t("v1.session.saved")}
            </span>
            {feedback.activeStageBand ? (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                {t("v1.session.stageTarget", { band: feedback.activeStageBand.toFixed(1) })}
              </span>
            ) : null}
          </div>
          <h1 className="text-xl font-semibold">{currentDelivery.textSnapshot}</h1>

          {/* 最终转写 */}
          <div className="rounded-2xl border border-border p-6">
            <h3 className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold text-secondary-text">
              <span>{t("aiCoach.transcript")}</span>
              {reviewAudioUrl ? <AudioPlayback src={reviewAudioUrl} className="w-52" /> : null}
            </h3>
            <p className="text-lg leading-relaxed">{savedAttempt?.finalTranscript ?? liveText}</p>
          </div>

          {/* 词汇建议（≤3，服务端生成） */}
          <div className="rounded-2xl border border-border p-6">
            <h3 className="mb-3 text-sm font-semibold text-secondary-text">
              {t("v1.session.vocab")}
            </h3>
            {feedback.vocab.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {feedback.vocab.map((v, i) => (
                  <li key={i} className="flex flex-col gap-1 rounded-xl bg-muted/20 p-3 text-sm">
                    <span>
                      <s className="text-secondary-text">{v.original}</s>
                      <span aria-hidden="true"> → </span>
                      <strong>{v.suggestion}</strong>
                    </span>
                    {v.note ? <span className="text-xs text-tertiary-text">{v.note}</span> : null}
                  </li>
                ))}
              </ul>
            ) : generating ? (
              <p className="text-sm text-tertiary-text">{t("aiCoach.generating")}</p>
            ) : (
              <p className="text-sm text-tertiary-text">{t("v1.session.vocabEmpty")}</p>
            )}
          </div>

          {/* 自然改写（流式） */}
          <div className="rounded-2xl border border-border p-6">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-secondary-text">
              {t("v1.session.rewrite")}
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
            </h3>
            {feedback.rewrite ? (
              <p className="text-base italic leading-relaxed">{feedback.rewrite}</p>
            ) : generating ? (
              <p className="text-sm text-tertiary-text">{t("v1.session.rewriteGenerating")}</p>
            ) : feedback.status === "degraded" ? null : (
              <p className="text-sm text-tertiary-text">{t("v1.session.rewriteGenerating")}</p>
            )}
          </div>

          {/* 降级提示（FR-007） */}
          {feedback.status === "degraded" ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 rounded-xl border border-[var(--danger-color)]/30 bg-[var(--danger-color)]/5 p-4"
            >
              <p className="text-sm text-[var(--danger-color)]">{t("v1.session.degraded")}</p>
              {savedAttempt ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void requestFeedback(savedAttempt.id)}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t("v1.session.degradedRetry")}
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {generating ? (
              <span className="inline-flex items-center gap-2 text-sm text-tertiary-text">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t("aiCoach.generating")}
              </span>
            ) : null}
            {index < total ? (
              <Button onClick={handleNext} disabled={generating}>
                {t("v1.session.next")}
              </Button>
            ) : (
              <Button onClick={() => void finishPractice()} disabled={generating}>
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("v1.session.finish")}
              </Button>
            )}
          </div>
        </section>
      </Shell>
    );
  }

  // ===== 诊断结果（FR-009）=====
  if (phase === "diagnostic-result" && diagnosticResult) {
    const dims = diagnosticResult.bandEvidence.dimensions;
    const dimLabels = locale === "zh" ? DIMENSION_LABELS : DIMENSION_LABELS_EN;
    const rows: { key: string; label: string; value: number | null }[] = [
      { key: "fluency", label: dimLabels.fluency, value: dims.fluency },
      { key: "lexical", label: dimLabels.lexical, value: dims.lexical },
      { key: "grammar", label: dimLabels.grammar, value: dims.grammar },
      { key: "pronunciation", label: dimLabels.pronunciation, value: dims.pronunciation },
    ];
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("v1.diag.title")}</h1>
          <p className="text-sm text-secondary-text">{t("v1.diag.desc")}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border p-5 text-center">
            <div className="text-xs font-medium text-tertiary-text">{t("v1.diag.current")}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">
              {diagnosticResult.currentBand.toFixed(1)}
            </div>
          </div>
          <div className="rounded-2xl border border-border p-5 text-center">
            <div className="text-xs font-medium text-tertiary-text">{t("v1.diag.target")}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">
              {diagnosticResult.finalGoalBand.toFixed(1)}
            </div>
          </div>
          <div className="rounded-2xl border border-foreground p-5 text-center">
            <div className="text-xs font-medium text-tertiary-text">{t("v1.diag.stage")}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">
              {diagnosticResult.activeStageBand.toFixed(1)}
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-border p-6">
          <h2 className="mb-3 text-sm font-semibold text-secondary-text">
            {t("v1.diag.dimensions")}
          </h2>
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between">
                <span className="text-sm text-secondary-text">{r.label}</span>
                {r.value == null ? (
                  <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-tertiary-text">
                    {t("v1.diag.notAssessed")}
                  </span>
                ) : (
                  <span className="text-sm font-bold tabular-nums">{r.value.toFixed(1)}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {diagnosticResult.bandEvidence.notes.length > 0 ? (
          <section className="rounded-2xl border border-border p-6">
            <h2 className="mb-2 text-sm font-semibold">{t("v1.diag.notes")}</h2>
            <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed text-secondary-text">
              {diagnosticResult.bandEvidence.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {diagnosticResult.stagePlan.length > 0 ? (
          <section className="rounded-2xl border border-border p-6">
            <h2 className="mb-2 text-sm font-semibold">
              {t("v1.diag.stagePlan")} → {diagnosticResult.finalGoalBand.toFixed(1)}
            </h2>
            <ol className="list-inside list-decimal space-y-1 text-sm text-secondary-text">
              {diagnosticResult.stagePlan.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="flex flex-col gap-3">
          <Button onClick={() => router.push("/practice")}>
            {t("v1.diag.startPractice")}
          </Button>
          <Link href="/progress" className={buttonClass("secondary", "md")}>
            {t("v1.diag.viewProgress")}
          </Link>
        </div>
      </div>
    );
  }

  // ===== 总结 =====
  const completedCount = attempts.filter((a) => a.endedBy !== "skipped").length;
  return (
    <Shell topic={topicLabel}>
      <section className="rounded-2xl border border-border p-6 text-center">
        <Check className="mx-auto h-8 w-8 text-green-600 dark:text-green-400" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold">
          {isFamiliar
            ? t("v1.session.summaryFamiliar.title")
            : t("v1.session.summaryStandard.title")}
        </h1>
        <p className="mt-2 text-sm text-secondary-text">
          {isFamiliar
            ? t("v1.session.summaryFamiliar.desc")
            : t("v1.session.summaryStandard.note")}
        </p>
        <p className="mt-1 text-sm text-tertiary-text">
          {t("v1.session.summary.answers", { count: completedCount })}
        </p>
      </section>

      {isFamiliar ? null : summaryLoading ? (
        <section className="flex items-center justify-center gap-2 rounded-2xl border border-border p-6 text-sm text-secondary-text">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("v1.session.summary.generating")}
        </section>
      ) : summaryData ? (
        <>
          {/* 训练用途预估（标准话题，D-3） */}
          <section className="rounded-2xl border-2 border-foreground p-6">
            <strong className="text-xs font-semibold text-secondary-text">
              {t("v1.session.summaryStandard.title")}
            </strong>
            <div className="mt-2 text-5xl font-bold tabular-nums">
              {summaryData.estimate?.toFixed(1)}
            </div>
            <p className="mt-2 text-xs text-tertiary-text">
              {t("v1.session.summaryStandard.note")}
            </p>
          </section>
          {summaryData.basis ? (
            <section className="rounded-2xl border border-border p-6">
              <h2 className="text-sm font-semibold">{t("v1.session.summary.basis")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary-text">
                {summaryData.basis}
              </p>
            </section>
          ) : null}
          {summaryData.nextFocus?.length ? (
            <section className="rounded-2xl border border-border p-6">
              <h2 className="text-sm font-semibold">{t("v1.session.summary.nextFocus")}</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary-text">
                {summaryData.nextFocus.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border p-6 text-center">
          <p className="text-sm text-tertiary-text">{t("v1.session.summary.unavailable")}</p>
          <Button variant="secondary" size="sm" onClick={() => void finishPractice()}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("common.retry")}
          </Button>
        </section>
      )}

      <div className="flex flex-col gap-3">
        <Button onClick={() => void repractice()}>{t("v1.session.summary.repractice")}</Button>
        <Link href="/progress" className={buttonClass("secondary", "md")}>
          {t("v1.session.summary.viewHistory")}
        </Link>
        <Link href="/practice" className={buttonClass("secondary", "md")}>
          {t("v1.session.summary.backHome")}
        </Link>
      </div>
    </Shell>
  );
}

/** 顶部返回 + 话题标签 */
function Shell({ topic, children }: { topic: string; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <div className="flex items-center justify-between">
        <Link
          href="/practice"
          className="inline-flex items-center gap-1.5 text-sm text-secondary-text transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("common.back")}
        </Link>
        <span className="text-sm font-medium text-secondary-text">{topic}</span>
      </div>
      {children}
    </div>
  );
}

function Meta({
  index,
  total,
  topic,
  mode,
}: {
  index: number;
  total: number;
  topic: string;
  mode: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-secondary-text">
      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
        {index}/{total}
      </span>
      <span className="text-xs">{topic}</span>
      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
        {mode === "personal_background" ? "Familiar" : "Standard"}
      </span>
    </div>
  );
}
