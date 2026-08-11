"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Loader2,
  Mic,
  Square,
} from "lucide-react";

import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useCountdown } from "@/hooks/useTimer";
import { useStreamText } from "@/hooks/useStreamText";
import { collectVagueHits, highlightVagueOnly, langFromAsr } from "@/lib/lexicon";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settingsStore";
import { activeStageBand } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { TopicSummary } from "@/components/practice/topic-summary";
import {
  VocabLinkedTranscript,
  VocabSummaryList,
  useVocabLinking,
} from "@/components/practice/vocab-linking";

/** 每个话题的固定题数（PRD：默认三问，最多第四问仅在信息不足时追加） */
const QUESTIONS_PER_TOPIC = 3;
/** 每题录音时长（秒，PRD 固定 30 秒） */
const RECORD_SECONDS = 30;

/** 一轮作答记录 */
export interface RoundRecord {
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
}

type Phase =
  | "loading" // 加载初始问题
  | "question" // S3 问题与思考
  | "recording" // S4 正在录音
  | "feedback" // S5 本题表达反馈
  | "summary" // S6 话题总结
  | "end" // S7/S8 结束页
  | "saving"; // 保存中

export function AiCoachSession({ topic }: { topic: string }) {
  const { t } = useT();
  const router = useRouter();
  const asrLang = useSettingsStore((s) => s.asrLang);
  const speech = useSpeechRecognition(asrLang);

  const [phase, setPhase] = useState<Phase>("loading");
  const [round, setRound] = useState(1);
  const [question, setQuestion] = useState("");
  const [records, setRecords] = useState<RoundRecord[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RoundRecord | null>(null);
  // 当前训练目标（activeStageBand，由当前水平与最终目标规划）
  const [stageBand, setStageBand] = useState<number>(6.5);

  // 实时转写状态（S4 录音中）
  const [liveText, setLiveText] = useState("");
  const liveTextRef = useRef("");

  // 30 秒倒计时（S4）
  const countdown = useCountdown(RECORD_SECONDS, () => {
    endAnswer();
  });

  // 推荐回答流式读取（S5 结束回答后 SSE）
  const recommendStream = useStreamText();

  // 转录稿标黄词的联动（S5 悬停瞬态 + 点击固定，汇总区只展示对应词条）
  const linking = useVocabLinking();

  // 语言模式切换：正在录音时清空旧语言转写，让新语言从零开始识别
  const prevAsrLangRef = useRef(asrLang);
  useEffect(() => {
    if (prevAsrLangRef.current === asrLang) return;
    prevAsrLangRef.current = asrLang;
    // 语音识别实例的重建由 useSpeechRecognition 处理（lang 变化时）
    // 这里只清空当前题的旧语言转写，避免混合语言内容
    setLiveText("");
    liveTextRef.current = "";
  }, [asrLang]);

  // 首题加载
  useEffect(() => {
    // 读取用户档案 → 计算当前训练目标（activeStageBand）
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
    loadQuestion(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  async function loadQuestion(roundNum: number) {
    setPhase("loading");
    setError(null);
    setFeedback(null);
    setLiveText("");
    liveTextRef.current = "";
    try {
      const res = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
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

  // 开始录音：启动倒计时 + 语音识别
  function handleStart() {
    setLiveText("");
    liveTextRef.current = "";
    speech.start();
    countdown.startCountdown();
    setPhase("recording");
  }

  // 结束回答（手动或倒计时归零）
  async function endAnswer() {
    if (phase !== "recording") return;
    speech.stop();
    countdown.resetCountdown();
    const finalText = liveTextRef.current;
    setLiveText(finalText);

    // 词汇标黄：本地词库即时生成（毫秒级）
    const localHits = collectVagueHits(finalText, langFromAsr(asrLang));
    const vocab = localHits.map((h) => ({
      original: h.original,
      suggestion: h.suggestion,
      note: "",
    }));

    const rec: RoundRecord = {
      question,
      transcript: finalText,
      recommendedAnswer: "",
      vocabularyHighlights: vocab,
      grammarNotes: "",
      naturalRewrite: "",
      degraded: false,
    };
    setFeedback(rec);
    setRecords((prev) => [...prev, rec]);
    linking.reset();
    setPhase("feedback");

    // 推荐回答：SSE 流式读取，逐字出现
    if (finalText.trim()) {
      setLoadingFeedback(true);
      await recommendStream.stream("/api/response-feedback", {
        topic,
        question,
        transcript: finalText,
        stageBand,
      });
      setLoadingFeedback(false);
      // 流结束后用完整文本更新记录
      const finalRec: RoundRecord = {
        ...rec,
        recommendedAnswer: recommendStream.text,
      };
      setFeedback(finalRec);
      setRecords((prev) =>
        prev.map((r) => (r === rec ? finalRec : r)),
      );
    }
  }

  // 下一题 / 完成话题
  function handleNext() {
    if (round < QUESTIONS_PER_TOPIC) {
      const next = round + 1;
      setRound(next);
      void loadQuestion(next);
    } else {
      // 已到最后一问 → 进入话题总结 S6
      setPhase("summary");
    }
  }

  // S4 录音态实时转写
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

  // ===== S3 问题与思考 =====
  if (phase === "question" || phase === "loading") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
        <TopBar topic={topic} />
        <section className="flex flex-col gap-6 rounded-2xl border border-border p-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-secondary-text">
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
              {round}/{QUESTIONS_PER_TOPIC}
            </span>
            <span className="text-xs">{topic}</span>
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
              <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
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

          {error ? (
            <p className="text-sm text-[var(--filler-color)]">{error}</p>
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
        <TopBar topic={topic} />
        <section className="flex flex-col gap-6 rounded-2xl border border-border p-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-secondary-text">
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
              {round}/{QUESTIONS_PER_TOPIC}
            </span>
            <span className="text-xs">{topic}</span>
            <span className="text-xs font-medium text-[var(--filler-color)]">
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
                  className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--filler-color)]"
                  aria-hidden="true"
                />
                {t("aiCoach.recording")}
              </h3>
              <span className="font-mono text-3xl font-bold tabular-nums text-foreground">
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
        <TopBar topic={topic} />
        {rec ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-tertiary-text">
                {t("aiCoach.saved")} ✓
              </span>
              <h1 className="text-xl font-semibold">{rec.question}</h1>
            </div>

            {/* 双栏：左转录稿 + 右推荐回答 */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* 转录稿（黄色词汇标记，联动） */}
              <div className="rounded-2xl border border-border p-5">
                <h3 className="mb-3 text-sm font-semibold text-secondary-text">
                  {t("aiCoach.transcript")}
                </h3>
                <VocabLinkedTranscript
                  transcript={rec.transcript}
                  handlers={linking.transcriptHandlers}
                  className="text-lg leading-relaxed"
                />
              </div>

              {/* 推荐回答 */}
              <div className="rounded-2xl border border-border bg-muted/20 p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-secondary-text">
                  {t("aiCoach.recommendedAnswer")}
                  {recommendStream.status === "streaming" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                </h3>
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
            <div className="rounded-2xl border border-border p-5">
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
            {(rec.grammarNotes || rec.naturalRewrite) ? (
              <div className="flex flex-col gap-4">
                {rec.grammarNotes ? (
                  <div className="rounded-2xl border border-border p-5">
                    <h3 className="mb-2 text-sm font-semibold text-secondary-text">
                      {t("aiCoach.grammarNotes")}
                    </h3>
                    <p className="text-sm leading-relaxed text-secondary-text">
                      {rec.grammarNotes}
                    </p>
                  </div>
                ) : null}
                {rec.naturalRewrite ? (
                  <div className="rounded-2xl border border-border p-5">
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
              {loadingFeedback ? (
                <span className="inline-flex items-center gap-2 text-sm text-tertiary-text">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("aiCoach.generating")}
                </span>
              ) : null}
              {!isLast ? (
                <Button onClick={handleNext} disabled={loadingFeedback}>
                  {t("aiCoach.nextQuestion")}
                  <ArrowLeft className="h-4 w-4 rotate-180" aria-hidden="true" />
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={loadingFeedback}>
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
      <TopicSummary
        topic={topic}
        records={records}
        onEnd={() => setPhase("end")}
        onNextTopic={() => {
          // TODO: 下一话题选择（MVP 先回到题库选话题）
          router.push("/bank");
        }}
      />
    );
  }

  // ===== S7/S8 结束页 =====
  if (phase === "end") {
    const totalAnswers = records.length;
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 py-8">
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
          <p className="mt-2 text-sm text-secondary-text">
            {t("aiCoach.topicsCompleted")}: {topic} · {t("aiCoach.answersCount")}:{" "}
            {totalAnswers}
          </p>
        </section>

        <div className="flex flex-col gap-3">
          <Button variant="secondary" onClick={() => setPhase("summary")}>
            {t("aiCoach.viewSummary")}
          </Button>
          <Link
            href="/bank"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-all duration-150 hover:bg-muted active:scale-[0.98]"
          >
            {t("aiCoach.otherTopics")}
          </Link>
          <Link
            href="/progress"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-all duration-150 hover:bg-muted active:scale-[0.98]"
          >
            {t("aiCoach.viewHistory")}
          </Link>
        </div>
      </div>
    );
  }

  // saving 态
  return (
    <div className="flex justify-center py-16 text-secondary-text">
      {t("common.loading")}
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
