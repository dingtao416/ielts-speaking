"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  Mic,
  Square,
} from "lucide-react";

import { speechErrorMessageKey, useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useCountdown } from "@/hooks/useTimer";
import { useStreamText } from "@/hooks/useStreamText";
import {
  analyzeText,
  collectVagueHits,
  highlightVagueOnly,
  langFromAsr,
} from "@/lib/lexicon";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settingsStore";
import { activeStageBand, roundHalf } from "@/lib/profile";
import { getNextTopic } from "@/lib/bank";
import { saveAudio } from "@/lib/local-audio";
import { Button, buttonClass } from "@/components/ui/button";
import { AudioPlayback } from "@/components/ui/audio-playback";
import { Modal } from "@/components/ui/modal";
import { TopicSummary } from "@/components/practice/topic-summary";
import {
  VocabLinkedTranscript,
  VocabSummaryList,
  useVocabLinking,
} from "@/components/practice/vocab-linking";

/** 每个话题的默认题数（PRD：默认三问，信息不足最多追加一问） */
const QUESTIONS_PER_TOPIC = 3;
/** 每题录音时长（秒，PRD 固定 30 秒） */
const RECORD_SECONDS = 30;
/** 第 3 问回答低于该词数时，追加一问针对性追问 */
const MIN_ANSWER_WORDS = 20;

/** 一轮作答记录 */
export interface RoundRecord {
  id: string;
  topic: string;
  question: string;
  transcript: string;
  recommendedAnswer: string;
  vocabularyHighlights: {
    original: string;
    suggestion: string;
    note: string;
  }[];
  grammarNotes: string;
  naturalRewrite: string;
  degraded: boolean;
  durationSec: number;
  startTime: string;
  /** 本地录音（IndexedDB）键 */
  audioKey?: string;
  /** 会话内回放 URL */
  audioUrl?: string;
}

/** 话题训练预估（训练用途，非官方成绩） */
export interface TopicSummaryData {
  estimate: number;
  basis: string;
  nextFocus: string[];
}

type Phase =
  | "loading" // 加载初始问题
  | "question" // S3 问题与思考
  | "recording" // S4 正在录音
  | "feedback" // S5 本题表达反馈
  | "summary" // S6 话题总结
  | "end"; // S7/S8 结束页

function uid() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AiCoachSession({ topic: initialTopic }: { topic: string }) {
  const { t } = useT();
  const asrLang = useSettingsStore((s) => s.asrLang);
  const speech = useSpeechRecognition(asrLang);

  const [phase, setPhase] = useState<Phase>("loading");
  const [round, setRound] = useState(1);
  const [currentTopic, setCurrentTopic] = useState(initialTopic);
  const [question, setQuestion] = useState("");
  const [records, setRecords] = useState<RoundRecord[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [feedback, setFeedback] = useState<RoundRecord | null>(null);
  // 当前训练目标（activeStageBand，由当前水平与最终目标规划）
  const [stageBand, setStageBand] = useState<number>(6.5);

  // 多话题会话：已完成话题（有序）+ 各话题已缓存的训练预估
  const [sessionTopics, setSessionTopics] = useState<string[]>([]);
  const [topicSummaries, setTopicSummaries] = useState<
    Record<string, TopicSummaryData>
  >({});
  const [summary, setSummary] = useState<TopicSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [viewTopic, setViewTopic] = useState<string | null>(null);
  // 下一话题确认弹窗
  const [pendingNextTopic, setPendingNextTopic] = useState<string | null>(null);
  const [showNextTopicModal, setShowNextTopicModal] = useState(false);
  // 针对性追问（第 4 问）是否已用
  const [followUpUsed, setFollowUpUsed] = useState(false);

  // 实时转写状态（S4 录音中）
  const [liveText, setLiveText] = useState("");
  const liveTextRef = useRef("");

  // 30 秒倒计时（S4）
  const countdown = useCountdown(RECORD_SECONDS, () => {
    void endAnswer();
  });

  // 推荐回答流式读取（S5 结束回答后 SSE）
  const recommendStream = useStreamText();

  // 转录稿标黄词的联动（S5 悬停瞬态 + 点击固定，汇总区只展示对应词条）
  const linking = useVocabLinking();

  // 录音采集（MediaRecorder，尽力而为）
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const objectUrlsRef = useRef<string[]>([]);

  // 语言模式切换：正在录音时清空旧语言转写，让新语言从零开始识别
  const prevAsrLangRef = useRef(asrLang);
  useEffect(() => {
    if (prevAsrLangRef.current === asrLang) return;
    prevAsrLangRef.current = asrLang;
    setLiveText("");
    liveTextRef.current = "";
  }, [asrLang]);

  // 卸载时释放录音流与 object URL。读最新 ref（流可能在录音中才创建），
  // 故对 exhaustive-deps 做局部豁免。
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      audioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  // 首题加载
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const overall = data?.profile?.overallBand;
        const target = data?.targetBand;
        if (typeof target === "number") {
          setStageBand(activeStageBand(overall, target));
        }
      })
      .catch(() => {
        /* 静默 */
      });
    void loadQuestion(1, initialTopic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopic]);

  async function loadQuestion(roundNum: number, topicArg?: string) {
    const topicForRound = topicArg ?? currentTopic;
    setPhase("loading");
    setFeedback(null);
    setLiveText("");
    liveTextRef.current = "";
    try {
      const res = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicForRound,
          round: roundNum,
          stageBand,
        }),
      });
      const data = await res.json();
      setQuestion(data?.question ?? "");
    } catch {
      setQuestion("");
    }
    setPhase("question");
  }

  // ===== 录音（尽力而为，失败不影响语音转写）=====
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
      /* 忽略：无音频也能练习 */
    }
  }

  function cleanupAudioStream() {
    audioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    audioStreamRef.current = null;
    mediaRecorderRef.current = null;
  }

  function stopAudioRecording(): Promise<{ key: string; url: string } | null> {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        cleanupAudioStream();
        resolve(null);
        return;
      }
      const key = uid();
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        void saveAudio(key, blob).catch(() => {
          /* 本地存储失败不阻塞 */
        });
        cleanupAudioStream();
        resolve({ key, url });
      };
      try {
        recorder.stop();
      } catch {
        cleanupAudioStream();
        resolve(null);
      }
    });
  }

  // 开始录音：启动倒计时 + 语音识别 + 音频采集
  function handleStart() {
    setLiveText("");
    liveTextRef.current = "";
    void startAudioRecording();
    speech.start();
    countdown.startCountdown();
    setPhase("recording");
  }

  function applyRecUpdate(id: string, patch: Partial<RoundRecord>) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setFeedback((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  // 结束回答（手动或倒计时归零）
  async function endAnswer() {
    if (phase !== "recording") return;
    speech.stop();
    countdown.resetCountdown();
    const finalText = liveTextRef.current;
    setLiveText(finalText);

    const audio = await stopAudioRecording();

    // 词汇标黄：本地词库即时生成（毫秒级）
    const localHits = collectVagueHits(finalText, langFromAsr(asrLang));
    const vocab = localHits.map((h) => ({
      original: h.original,
      suggestion: h.suggestion,
      note: "",
    }));

    const rec: RoundRecord = {
      id: uid(),
      topic: currentTopic,
      question,
      transcript: finalText,
      recommendedAnswer: "",
      vocabularyHighlights: vocab,
      grammarNotes: "",
      naturalRewrite: "",
      degraded: false,
      durationSec: RECORD_SECONDS,
      startTime: new Date().toISOString(),
      audioKey: audio?.key,
      audioUrl: audio?.url,
    };
    setFeedback(rec);
    setRecords((prev) => [...prev, rec]);
    linking.reset();
    setPhase("feedback");

    if (!finalText.trim()) {
      void saveSessionRecord(rec);
      return;
    }

    // 语法/改写：与推荐回答并行
    setGrammarLoading(true);
    const grammarPromise = fetch("/api/grammar-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, transcript: finalText, stageBand }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        const patch = {
          grammarNotes: typeof data?.grammarNotes === "string" ? data.grammarNotes : "",
          naturalRewrite:
            typeof data?.naturalRewrite === "string" ? data.naturalRewrite : "",
        };
        applyRecUpdate(rec.id, patch);
        return patch;
      })
      .catch(() => null)
      .finally(() => setGrammarLoading(false));

    // 推荐回答：SSE 流式读取，逐字出现
    setLoadingFeedback(true);
    const { text: recommended } = await recommendStream.stream(
      "/api/response-feedback",
      {
        topic: currentTopic,
        question,
        transcript: finalText,
        stageBand,
      },
    );
    setLoadingFeedback(false);
    applyRecUpdate(rec.id, { recommendedAnswer: recommended });

    // 等语法结果也落地后统一保存
    const grammar = await grammarPromise;
    void saveSessionRecord({
      ...rec,
      recommendedAnswer: recommended,
      ...(grammar ?? {}),
    });
  }

  // 保存单题会话记录（AI 教练流程 → 历史可见）
  function saveSessionRecord(rec: RoundRecord) {
    const stats = analyzeText(rec.transcript, langFromAsr(asrLang));
    void fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "train",
        topic: rec.topic,
        part: 1,
        durationSec: rec.durationSec,
        fullText: rec.transcript,
        stats: stats ?? {
          totalWords: 0,
          fillers: 0,
          hedges: 0,
          vagueWords: 0,
          chinglish: 0,
          grammar: 0,
          density: 100,
          duration: rec.durationSec,
        },
        feedback: {
          recommendedAnswer: rec.recommendedAnswer || undefined,
          vocabularyHighlights: rec.vocabularyHighlights,
          grammarNotes: rec.grammarNotes || undefined,
          naturalRewrite: rec.naturalRewrite || undefined,
          degraded: rec.degraded,
        },
      }),
    }).catch(() => {
      /* 保存失败不阻塞 UI */
    });
  }

  // 第 3 问回答过短 → 追加一问针对性追问
  function lastAnswerTooShort() {
    const last = [...records].reverse().find((r) => r.topic === currentTopic);
    if (!last) return false;
    const words = last.transcript.trim().split(/\s+/).filter(Boolean).length;
    return words < MIN_ANSWER_WORDS;
  }

  // 下一题 / 针对性追问 / 完成话题
  function handleNext() {
    if (round < QUESTIONS_PER_TOPIC) {
      const next = round + 1;
      setRound(next);
      void loadQuestion(next, currentTopic);
    } else if (
      round === QUESTIONS_PER_TOPIC &&
      !followUpUsed &&
      lastAnswerTooShort()
    ) {
      // 第 4 问针对性追问
      setFollowUpUsed(true);
      const next = round + 1;
      setRound(next);
      void loadQuestion(next, currentTopic);
    } else {
      void finishTopic();
    }
  }

  // 进入 S6：拉取话题训练预估并缓存
  async function finishTopic() {
    setPhase("summary");
    setSummaryLoading(true);
    try {
      const topicRecords = records.filter((r) => r.topic === currentTopic);
      const res = await fetch("/api/topic-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: currentTopic,
          rounds: topicRecords.map((r) => ({
            question: r.question,
            transcript: r.transcript,
            vocabularyHighlights: r.vocabularyHighlights,
          })),
        }),
      });
      const data = await res.json();
      const data_: TopicSummaryData = {
        estimate: typeof data?.estimate === "number" ? data.estimate : 5.0,
        basis: typeof data?.basis === "string" ? data.basis : "",
        nextFocus: Array.isArray(data?.nextFocus) ? data.nextFocus : [],
      };
      setSummary(data_);
      setTopicSummaries((prev) => ({ ...prev, [currentTopic]: data_ }));
    } catch {
      setSummary(null);
    }
    setSummaryLoading(false);
  }

  // ===== 多话题：下一话题弹窗 + 结束 =====
  function handleNextTopicClick() {
    setPendingNextTopic(getNextTopic(currentTopic));
    setShowNextTopicModal(true);
  }

  function confirmNextTopic() {
    if (!pendingNextTopic) return;
    setSessionTopics((prev) => [...prev, currentTopic]);
    const next = pendingNextTopic;
    setCurrentTopic(next);
    setRound(1);
    setFollowUpUsed(false);
    setSummary(null);
    setShowNextTopicModal(false);
    setPendingNextTopic(null);
    void loadQuestion(1, next);
  }

  function endFromSummary() {
    setSessionTopics((prev) => [...prev, currentTopic]);
    setPhase("end");
  }

  // ===== S4 录音态实时转写 =====
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
  }, [phase, question]);

  // 语音识别错误 → 回到问题态
  useEffect(() => {
    if (speech.error && phase === "recording") {
      countdown.resetCountdown();
      setPhase("question");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.error, phase]);

  const isLast = round >= QUESTIONS_PER_TOPIC;
  const canFollowUp =
    round === QUESTIONS_PER_TOPIC && !followUpUsed && lastAnswerTooShort();
  const generating = loadingFeedback || grammarLoading;

  // ===== S8 回看某话题总结 =====
  if (viewTopic) {
    return (
      <TopicSummary
        topic={viewTopic}
        records={records.filter((r) => r.topic === viewTopic)}
        summary={topicSummaries[viewTopic] ?? null}
        summaryLoading={false}
        mode="view"
        onEnd={() => setViewTopic(null)}
      />
    );
  }

  // ===== S3 问题与思考 =====
  if (phase === "question" || phase === "loading") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
        <TopBar topic={currentTopic} />
        <section className="flex flex-col gap-6 rounded-2xl border border-border p-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-secondary-text">
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
              {round}/{QUESTIONS_PER_TOPIC}
            </span>
            <span className="text-xs">{currentTopic}</span>
          </div>
          <h1 className="text-3xl font-semibold leading-tight">
            {phase === "loading" ? t("common.loading") : question}
          </h1>
          <p className="text-sm text-tertiary-text">
            {t("aiCoach.thinkHint")}
          </p>

          {/* record-zone：准备开始 */}
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-secondary-text">
                {t("aiCoach.ready")}
              </h3>
              <span
                className="font-mono text-2xl font-bold tabular-nums text-foreground"
                role="timer"
                aria-label={t("aiCoach.secondsRemaining", { seconds: RECORD_SECONDS })}
              >
                00:{String(RECORD_SECONDS).padStart(2, "0")}
              </span>
            </div>
            <p className="text-sm text-tertiary-text">
              {t("aiCoach.countdownHint")}
            </p>
            <div className="flex items-center gap-3">
              <Button size="lg" onClick={handleStart} disabled={!question}>
                <Mic className="h-5 w-5" aria-hidden="true" />
                {t("aiCoach.startRecording")}
              </Button>
            </div>
          </div>

          {/* 麦克风/识别错误 + 重试 */}
          {speech.error && speech.state === "error" ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 rounded-xl border border-[var(--danger-color)]/30 bg-[var(--danger-color)]/5 p-4"
            >
              <p className="text-sm leading-relaxed text-[var(--danger-color)]">
                {t(speechErrorMessageKey(speech.error))}
              </p>
              <Button variant="secondary" size="sm" onClick={handleStart}>
                <Mic className="h-4 w-4" aria-hidden="true" />
                {t("common.retry")}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  // ===== S4 正在录音 =====
  if (phase === "recording") {
    const remaining = countdown.remaining;
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
        <TopBar topic={currentTopic} />
        <section className="flex flex-col gap-6 rounded-2xl border border-border p-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-secondary-text">
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
              {round}/{QUESTIONS_PER_TOPIC}
            </span>
            <span className="text-xs">{currentTopic}</span>
            <span className="text-xs font-medium text-[var(--recording-color)]">
              {t("aiCoach.recording")}
            </span>
          </div>
          <h1 className="text-3xl font-semibold leading-tight">{question}</h1>

          {/* record-zone：正在录音 */}
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
                {t("aiCoach.recording")}
              </h3>
              <span
                className="font-mono text-3xl font-bold tabular-nums text-foreground"
                role="timer"
                aria-label={t("aiCoach.secondsRemaining", { seconds: remaining })}
              >
                00:{String(remaining).padStart(2, "0")}
              </span>
            </div>
            <p className="text-sm text-tertiary-text">
              {t("aiCoach.liveTranscriptHint")}
            </p>

            {/* 波形动画 */}
            <div className="flex h-13 items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className="wave-bar w-1 rounded-full bg-foreground"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>

            {/* 实时转写（仅黄色词汇标记） */}
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
                <p className="text-tertiary-text">{t("aiCoach.waitingTranscript")}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="lg"
                variant="danger"
                onClick={() => void endAnswer()}
              >
                <Square className="h-5 w-5" aria-hidden="true" />
                {t("aiCoach.endAnswer")}
              </Button>
              <span className="text-sm text-tertiary-text">
                {t("aiCoach.autoStopHint")}
              </span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ===== S5 本题表达反馈 =====
  if (phase === "feedback") {
    const rec = feedback ?? records[records.length - 1];
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 py-8">
        <TopBar topic={currentTopic} />
        {rec ? (
          <>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("aiCoach.saved")}
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                  {t("aiCoach.stageTarget", { band: stageBand.toFixed(1) })}
                </span>
              </div>
              <h1 className="text-xl font-semibold">{rec.question}</h1>
            </div>

            {/* 双栏：左转录稿 + 右推荐回答 */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* 转录稿（黄色词汇标记，联动） */}
              <div className="rounded-2xl border border-border p-6">
                <h3 className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold text-secondary-text">
                  <span>{t("aiCoach.transcript")}</span>
                  {rec.audioUrl ? (
                    <AudioPlayback src={rec.audioUrl} className="w-52" />
                  ) : null}
                </h3>
                <VocabLinkedTranscript
                  transcript={rec.transcript}
                  handlers={linking.transcriptHandlers}
                  className="text-lg leading-relaxed"
                />
              </div>

              {/* 推荐回答 */}
              <div className="rounded-2xl border border-border bg-muted/20 p-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-secondary-text">
                  {t("aiCoach.recommendedAnswer")}
                  {recommendStream.status === "streaming" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                </h3>
                <p className="-mt-2 mb-3 text-xs text-tertiary-text">
                  {t("aiCoach.recommendedNote", { band: stageBand.toFixed(1) })}
                </p>
                {recommendStream.status === "streaming" ? (
                  <p className="whitespace-pre-wrap text-base leading-relaxed">
                    {recommendStream.text}
                  </p>
                ) : rec.recommendedAnswer ? (
                  <p className="whitespace-pre-wrap text-base leading-relaxed">
                    {rec.recommendedAnswer}
                  </p>
                ) : (
                  <p className="text-sm text-tertiary-text">{t("aiCoach.generating")}</p>
                )}
              </div>
            </div>

            {/* 标黄词汇汇总（联动：只显示对应词条） */}
            <div className="rounded-2xl border border-border p-6">
              <h3 className="mb-3 text-sm font-semibold text-secondary-text">
                {t("aiCoach.vocabSummary")}
              </h3>
              <VocabSummaryList
                highlights={rec.vocabularyHighlights}
                active={linking.active}
                onItemHover={linking.onItemHover}
                onItemClick={linking.onItemClick}
              />
            </div>

            {/* 语法 + 改写（复盘详情） */}
            {rec.grammarNotes || rec.naturalRewrite || grammarLoading ? (
              <div className="flex flex-col gap-4">
                {grammarLoading && !rec.grammarNotes && !rec.naturalRewrite ? (
                  <p className="inline-flex items-center gap-2 text-sm text-tertiary-text">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {t("aiCoach.generating")}
                  </p>
                ) : null}
                {rec.grammarNotes ? (
                  <div className="rounded-2xl border border-border p-6">
                    <h3 className="mb-2 text-sm font-semibold text-secondary-text">
                      {t("aiCoach.grammarNotes")}
                    </h3>
                    <p className="text-sm leading-relaxed text-secondary-text">
                      {rec.grammarNotes}
                    </p>
                  </div>
                ) : null}
                {rec.naturalRewrite ? (
                  <div className="rounded-2xl border border-border p-6">
                    <h3 className="mb-2 text-sm font-semibold text-secondary-text">
                      {t("aiCoach.naturalRewrite")}
                    </h3>
                    <p className="text-base italic leading-relaxed">
                      {rec.naturalRewrite}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 操作 */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              {generating ? (
                <span className="inline-flex items-center gap-2 text-sm text-tertiary-text">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("aiCoach.generating")}
                </span>
              ) : null}
              {!isLast ? (
                <Button onClick={handleNext} disabled={generating}>
                  {t("aiCoach.nextQuestion")}
                  <ArrowLeft className="h-4 w-4 rotate-180" aria-hidden="true" />
                </Button>
              ) : canFollowUp ? (
                <Button onClick={handleNext} disabled={generating}>
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  {t("aiCoach.targetedFollowUp")}
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={generating}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t("aiCoach.finishTopic")}
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-center text-sm text-tertiary-text">{t("common.loading")}</p>
        )}
      </div>
    );
  }

  // ===== S6 话题总结 =====
  if (phase === "summary") {
    return (
      <>
        <TopicSummary
          topic={currentTopic}
          records={records.filter((r) => r.topic === currentTopic)}
          summary={summary}
          summaryLoading={summaryLoading}
          mode="session"
          onEnd={endFromSummary}
          onNextTopic={handleNextTopicClick}
        />
        <Modal
          open={showNextTopicModal && Boolean(pendingNextTopic)}
          onClose={() => {
            setShowNextTopicModal(false);
            setPendingNextTopic(null);
          }}
          labelledBy="next-topic-title"
          describedBy="next-topic-desc"
          maxWidth="max-w-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-secondary-text">
            {t("aiCoach.topicTransitionTitle")}
          </p>
          <h2 id="next-topic-title" className="mt-1 text-xl font-bold">
            {currentTopic} {t("aiCoach.topicCompleted")}
          </h2>
          <p id="next-topic-desc" className="mt-2 text-sm text-secondary-text">
            {t("aiCoach.topicTransitionDesc", {
              count: records.filter((r) => r.topic === currentTopic).length,
            })}
          </p>
          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
            <span className="text-xs text-tertiary-text">
              {t("aiCoach.nextTopicLabel")}
            </span>
            <strong className="block text-lg">{pendingNextTopic}</strong>
            <small className="text-tertiary-text">
              {t("aiCoach.startFromFirst")}
            </small>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowNextTopicModal(false);
                setPendingNextTopic(null);
              }}
            >
              {t("aiCoach.returnToSummary")}
            </Button>
            <Button variant="danger" onClick={endFromSummary}>
              {t("aiCoach.endSession")}
            </Button>
            <Button data-autofocus onClick={confirmNextTopic}>
              {t("aiCoach.startTopic", { topic: pendingNextTopic ?? "" })}
            </Button>
          </div>
        </Modal>
      </>
    );
  }

  // ===== S7/S8 结束页 =====
  const completedTopics = sessionTopics;
  const isMulti = completedTopics.length >= 2;
  const totalAnswers = records.length;

  const sessionEstimate = isMulti
    ? roundHalf(
        completedTopics.reduce(
          (s, tp) => s + (topicSummaries[tp]?.estimate ?? 0),
          0,
        ) / completedTopics.length,
      )
    : null;
  const commonFocus = isMulti
    ? completedTopics.flatMap((tp) => topicSummaries[tp]?.nextFocus ?? [])
    : [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <div className="flex items-center justify-between">
        <Link
          href="/bank"
          className="inline-flex items-center gap-1.5 text-sm text-secondary-text transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("common.back")}
        </Link>
      </div>

      <section className="rounded-2xl border border-border p-6 text-center">
        <Check className="mx-auto h-8 w-8 text-green-600 dark:text-green-400" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold">{t("aiCoach.sessionSaved")}</h1>
        {isMulti ? (
          <p className="mt-2 text-sm text-secondary-text">
            {t("aiCoach.sessionSummary", {
              topics: completedTopics.length,
              answers: totalAnswers,
            })}
          </p>
        ) : (
          <p className="mt-2 text-sm text-secondary-text">
            {t("aiCoach.topicsCompleted")}: {completedTopics[0] ?? currentTopic} ·{" "}
            {t("aiCoach.answersCount")}: {totalAnswers}
          </p>
        )}
      </section>

      {isMulti ? (
        <>
          {/* 本次练习训练预估 */}
          <section className="rounded-2xl border-2 border-foreground p-6">
            <strong className="text-xs font-semibold text-secondary-text">
              {t("aiCoach.sessionEstimate")}
            </strong>
            <div className="mt-2 text-5xl font-bold tabular-nums">
              {sessionEstimate?.toFixed(1)}
            </div>
            <p className="mt-2 text-xs text-tertiary-text">
              {t("aiCoach.sessionEstimateNote")}
            </p>
          </section>

          {/* 跨话题共同问题 / 下次训练重点 */}
          <section className="rounded-2xl border border-border p-6">
            <h2 className="text-sm font-semibold">{t("aiCoach.commonIssues")}</h2>
            {commonFocus.length ? (
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary-text">
                {commonFocus.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-tertiary-text">{t("aiCoach.noIssues")}</p>
            )}
          </section>

          {/* 已完成话题列表 */}
          <section>
            <h2 className="mb-2 text-sm font-semibold">{t("aiCoach.allTopicsCompleted")}</h2>
            <div className="flex flex-col gap-2">
              {completedTopics.map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setViewTopic(tp)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-muted"
                >
                  <span>
                    <strong className="block text-base">{tp}</strong>
                    <span className="block text-sm text-secondary-text">
                      {records.filter((r) => r.topic === tp).length}{" "}
                      {t("aiCoach.answersCount")}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {t("aiCoach.viewTopicSummary")} →
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setViewTopic(completedTopics[0] ?? currentTopic)}>
          {t("aiCoach.viewSummary")}
        </Button>
      )}

      <div className="flex flex-col gap-3">
        <Link href="/bank" className={buttonClass("secondary", "md")}>
          {t("aiCoach.otherTopics")}
        </Link>
        <Link href="/progress" className={buttonClass("secondary", "md")}>
          {t("aiCoach.viewHistory")}
        </Link>
      </div>
    </div>
  );
}

function TopBar({ topic }: { topic: string }) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-between">
      <Link
        href="/bank"
        className="inline-flex items-center gap-1.5 text-sm text-secondary-text transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("common.back")}
      </Link>
      <span className="text-sm font-medium text-secondary-text">{topic}</span>
    </div>
  );
}
