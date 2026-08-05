"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Mic,
  Pause,
  Play,
  Save,
  Square,
  Sparkles,
  Wand2,
} from "lucide-react";

import type { Question } from "@/lib/bank";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTimer } from "@/hooks/useTimer";
import { useStreamText } from "@/hooks/useStreamText";
import {
  analyzeText,
  collectIssues,
  highlightTokens,
  type HighlightCategory,
} from "@/lib/lexicon";
import { usePracticeStore } from "@/store/sessionStore";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settingsStore";

export function PracticeSession({ question }: { question: Question }) {
  const { t } = useT();
  const asrLang = useSettingsStore((s) => s.asrLang);
  const speech = useSpeechRecognition(asrLang);
  const timer = useTimer();
  const reportStream = useStreamText();

  const store = usePracticeStore();
  const lastFeedbackAtRef = useRef(0);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 显示实时反馈
  useEffect(() => {
    speech.setOnResult((result) => {
      if (result.isFinal) {
        store.appendFinal(result.text);
      } else {
        store.setInterim(result.text);
      }
    });
  }, [speech, store]);

  // 每 ~10 秒做一次实时词级分析 + AI 教练
  const runFeedback = useCallback(
    async (text: string) => {
      const analysis = analyzeText(text);
      if (analysis) {
        store.updateStats({ ...analysis, duration: timer.elapsed });
      }
      const issues = collectIssues(text);

      // 词级反馈（本地，即时）
      const unique = new Map<string, { cat: HighlightCategory; suggestion?: string }>();
      for (const issue of issues) {
        const key = issue.category + ":" + issue.word.toLowerCase();
        if (!unique.has(key)) {
          unique.set(key, {
            cat: issue.category,
            suggestion: issue.suggestion,
          });
        }
      }
      unique.forEach((info, key) => {
        const word = key.split(":")[1];
        if (info.cat === "filler") {
          store.addCoachTip({
            id: `f-${Date.now()}-${word}`,
            text: `"${word}" — 填充词，试试停顿`,
            category: "filler",
          });
        } else if (info.cat === "hedge") {
          store.addCoachTip({
            id: `h-${Date.now()}-${word}`,
            text: `"${word}" — 犹豫词，直接说`,
            category: "hedge",
          });
        } else if (info.cat === "vague") {
          store.addCoachTip({
            id: `v-${Date.now()}-${word}`,
            text: `"${word}" → ${info.suggestion ?? "换高分词"}`,
            category: "vague",
          });
        } else if (info.cat === "chinglish") {
          store.addCoachTip({
            id: `c-${Date.now()}-${word}`,
            text: `"${word}" — 中式英语，用 ${info.suggestion ?? "更地道的说法"}`,
            category: "hedge",
          });
        }
      });

      // AI 教练（限流：每 ~20 秒一次）
      const now = Date.now();
      if (now - lastFeedbackAtRef.current > 20000) {
        lastFeedbackAtRef.current = now;
        try {
          const res = await fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: text.slice(-500),
              topic: question.topic,
              part: question.part,
              elapsedSec: timer.elapsed,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.tip) {
              store.addCoachTip({
                id: `ai-${Date.now()}`,
                text: data.tip,
                category: "ai",
              });
            }
          }
        } catch {
          /* 静默 */
        }
      }
    },
    [store, timer.elapsed, question.topic, question.part],
  );

  // 录制后定时分析
  useEffect(() => {
    if (!timer.running) {
      return;
    }
    const interval = setInterval(() => {
      const latest = store.fullText;
      if (latest) {
        void runFeedback(latest);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [timer.running, store.fullText, runFeedback]);

  function handleStart() {
    store.clearCoachTips();
    store.reset();
    timer.start();
    setSaveSuccess(false);
    speech.start();
  }

  function handleStop() {
    speech.stop();
    timer.stop();
    const finalText = store.fullText;
    if (finalText) {
      void runFeedback(finalText);
    }
  }

  async function generateReport() {
    store.setReportStatus("generating");
    await reportStream.stream("/api/report", {
      fullText: store.fullText,
      stats: { ...store.stats, duration: timer.elapsed },
      questionId: question.id,
    });
    if (reportStream.text) {
      store.setReport(reportStream.text);
    }
  }

  async function extractFramework() {
    store.setFrameworkStatus("extracting");
    try {
      const res = await fetch("/api/framework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          fullText: store.fullText,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      store.setFramework(data.framework ?? null);
      store.setFrameworkStatus("done");
    } catch {
      store.setFrameworkStatus("error");
    }
  }

  async function saveFramework() {
    const fw = store.framework as
      | { topic?: string; part?: number; structure?: string[]; keyPoints?: string[]; expressions?: { phrase: string; meaning: string }[]; intro?: string }
      | null;
    if (!fw) return;
    try {
      const res = await fetch("/api/frameworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: question.topic,
          part: question.part,
          sourceQuestionId: question.id,
          sourceYear: question.year,
          structure: fw.structure ?? [],
          keyPoints: fw.keyPoints ?? [],
          expressions: fw.expressions ?? [],
          intro: fw.intro ?? "",
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
      }
    } catch {
      /* 静默 */
    }
  }

  async function saveSession() {
    if (!store.fullText) return;
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          topic: question.topic,
          part: question.part,
          mode: "train",
          durationSec: timer.elapsed,
          fullText: store.fullText,
          stats: { ...store.stats, duration: timer.elapsed },
          reportMarkdown: store.reportMarkdown,
        }),
      });
    } catch {
      /* 静默 */
    }
  }

  // 停止时保存记录
  const saveSessionRef = useRef(saveSession);
  saveSessionRef.current = saveSession;
  useEffect(() => {
    if (store.reportStatus === "done") {
      void saveSessionRef.current();
    }
  }, [store.reportStatus]);

  const stats = store.stats;
  const statItems: {
    label: string;
    value: number | string;
    cat: HighlightCategory | null;
  }[] = [
    { label: t("practice.stat.fillers"), value: stats.fillers, cat: "filler" },
    { label: t("practice.stat.hedges"), value: stats.hedges, cat: "hedge" },
    { label: t("practice.stat.vague"), value: stats.vagueWords, cat: "vague" },
    { label: t("practice.stat.chinglish"), value: stats.chinglish, cat: "chinglish" },
    { label: t("practice.stat.density"), value: `${stats.density}%`, cat: null },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 顶栏 */}
      <div className="flex items-center justify-between">
        <Link
          href="/bank"
          className="inline-flex items-center gap-1.5 text-sm text-secondary-text transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("common.back")}
        </Link>
        <div className="text-sm font-mono tabular-nums text-secondary-text">
          {String(Math.floor(timer.elapsed / 60)).padStart(2, "0")}:
          {String(timer.elapsed % 60).padStart(2, "0")}
        </div>
      </div>

      {/* 题目卡 */}
      <div className="rounded-2xl border border-border p-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-semibold text-background">
            Part {question.part}
          </span>
          <span className="text-xs font-medium text-tertiary-text">
            {question.topic} · {question.year}
          </span>
        </div>
        <h1 className="text-xl font-semibold leading-relaxed">
          {question.question}
        </h1>
        {question.cueCard ? (
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-secondary-text">
            {question.cueCard.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 三栏布局 */}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr_280px]">
        {/* 左：统计 + 教练 */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold text-secondary-text">
              实时统计
            </h3>
            <div className="flex flex-col gap-2.5">
              {statItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-secondary-text">
                    {item.label}
                  </span>
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      item.cat === "filler" || item.cat === "hedge" || item.cat === "vague"
                        ? item.cat === "filler"
                          ? "text-[var(--filler-color)]"
                          : item.cat === "hedge"
                            ? "text-[var(--hedge-color)]"
                            : "text-[var(--vague-color)]"
                        : "text-foreground"
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border border-border p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-secondary-text">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("practice.coach")}
            </h3>
            <div className="flex flex-col gap-2">
              {store.coachTips.length === 0 ? (
                <p className="text-xs text-tertiary-text">
                  {t("practice.coachEmpty")}
                </p>
              ) : (
                store.coachTips.slice(0, 8).map((tip) => (
                  <div
                    key={tip.id}
                    className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      tip.category === "good"
                        ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {tip.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 中：字幕 + 控制 */}
        <div className="flex flex-col gap-4">
          <div className="min-h-[260px] rounded-2xl border border-border p-5">
            {!speech.supported ? (
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-secondary-text">
                  {speech.unsupportedReason === "insecure-context"
                    ? t("practice.micInsecure")
                    : t("practice.micUnsupported")}
                </p>
              </div>
            ) : store.fullText || store.interimText ? (
              <div className="space-y-3">
                {store.sentences.map((s, i) => (
                  <p
                    key={i}
                    className="text-lg leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: highlightTokens(s) }}
                  />
                ))}
                {store.interimText ? (
                  <p
                    className="text-lg leading-relaxed opacity-60"
                    dangerouslySetInnerHTML={{
                      __html: highlightTokens(store.interimText),
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex h-full min-h-[220px] items-center justify-center">
                <p className="text-center text-sm text-tertiary-text">
                  {t("practice.speakHint")}
                </p>
              </div>
            )}
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-center gap-3">
            {speech.state === "idle" || speech.state === "error" ? (
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-base font-medium text-background transition-opacity hover:opacity-90"
              >
                <Mic className="h-5 w-5" aria-hidden="true" />
                {t("practice.start")}
              </button>
            ) : speech.state === "listening" ? (
              <>
                <button
                  type="button"
                  onClick={() => speech.pause()}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-base font-medium transition-colors hover:bg-muted"
                >
                  <Pause className="h-5 w-5" aria-hidden="true" />
                  {t("practice.pause")}
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-base font-medium text-background transition-opacity hover:opacity-90"
                >
                  <Square className="h-5 w-5" aria-hidden="true" />
                  {t("practice.stop")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => speech.resume()}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-base font-medium transition-colors hover:bg-muted"
                >
                  <Play className="h-5 w-5" aria-hidden="true" />
                  {t("practice.resume")}
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-base font-medium text-background transition-opacity hover:opacity-90"
                >
                  <Square className="h-5 w-5" aria-hidden="true" />
                  {t("practice.stop")}
                </button>
              </>
            )}
          </div>

          {/* 生成报告 */}
          {store.fullText && !timer.running ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={generateReport}
                disabled={store.reportStatus === "generating"}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                {store.reportStatus === "generating"
                  ? t("practice.report.generating")
                  : t("practice.generateReport")}
              </button>
              {!store.framework && (
                <button
                  type="button"
                  onClick={extractFramework}
                  disabled={store.frameworkStatus === "extracting"}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Wand2 className="h-4 w-4" aria-hidden="true" />
                  {t("practice.frameworkEmpty")}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* 右：框架 */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border p-4">
            <h3 className="mb-3 text-sm font-semibold text-secondary-text">
              {t("practice.framework")}
            </h3>
            {store.framework ? (
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <div className="mb-1 font-medium">结构</div>
                  <ol className="list-inside list-decimal space-y-1 text-secondary-text">
                    {(store.framework as { structure?: string[] }).structure?.map(
                      (s, i) => <li key={i}>{s}</li>,
                    )}
                  </ol>
                </div>
                <div>
                  <div className="mb-1 font-medium">要点</div>
                  <ul className="list-inside list-disc space-y-1 text-secondary-text">
                    {(store.framework as { keyPoints?: string[] }).keyPoints?.map(
                      (k, i) => <li key={i}>{k}</li>,
                    )}
                  </ul>
                </div>
                {saveSuccess ? (
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    已保存到素材本 ✓
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={saveFramework}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {t("practice.saveFramework")}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-tertiary-text">
                {store.frameworkStatus === "extracting"
                  ? "正在提取框架…"
                  : store.frameworkStatus === "error"
                    ? "提取失败，请重试"
                    : t("practice.frameworkEmpty")}
              </p>
            )}
          </div>

          {/* 报告 */}
          {store.reportStatus !== "idle" && (
            <div className="rounded-2xl border border-border p-4">
              <h3 className="mb-2 text-sm font-semibold text-secondary-text">
                {t("practice.report.title")}
              </h3>
              {store.reportStatus === "generating" ? (
                <p className="text-sm text-tertiary-text">
                  {t("practice.report.generating")}
                </p>
              ) : store.reportStatus === "error" ? (
                <p className="text-sm text-[var(--filler-color)]">
                  {t("practice.report.failed")}
                </p>
              ) : (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {store.reportMarkdown}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
