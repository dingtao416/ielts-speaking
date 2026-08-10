"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Mic, Square, Wand2 } from "lucide-react";

import type { Question } from "@/lib/bank";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTimer } from "@/hooks/useTimer";
import { analyzeText, highlightTokens, langFromAsr } from "@/lib/lexicon";
import type { Framework } from "@/lib/frameworks";
import { usePracticeStore } from "@/store/sessionStore";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settingsStore";
import { getModelAnswerPrompt } from "@/lib/prompts";
import { Button } from "@/components/ui/button";

export function ReciteSession({ question }: { question: Question }) {
  const { t } = useT();
  const asrLang = useSettingsStore((s) => s.asrLang);
  const analysisLang = langFromAsr(asrLang);
  const speech = useSpeechRecognition(asrLang);
  const timer = useTimer();
  const store = usePracticeStore();

  const [framework, setFramework] = useState<Framework | null>(null);
  const [loadingFramework, setLoadingFramework] = useState(true);
  const [showCues, setShowCues] = useState(true);
  const [modelAnswer, setModelAnswer] = useState<string | null>(null);
  const [generatingAnswer, setGeneratingAnswer] = useState(false);

  // 加载该话题已保存的框架（优先匹配 topic）
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/frameworks");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list: Framework[] = data.frameworks ?? [];
        const match = list.find((f) => f.topic === question.topic) ?? null;
        setFramework(match);
      } finally {
        if (!cancelled) setLoadingFramework(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [question.topic]);

  // 识别结果 → 字幕
  useEffect(() => {
    speech.setOnResult((result) => {
      if (result.isFinal) {
        store.appendFinal(result.text);
        const analysis = analyzeText(store.fullText + " " + result.text, analysisLang);
        if (analysis) {
          store.updateStats({ ...analysis, duration: timer.elapsed });
        }
      } else {
        store.setInterim(result.text);
      }
    });
  }, [speech, store, timer.elapsed, analysisLang]);

  const saveSessionRef = useRef<() => void>(() => {});
  saveSessionRef.current = () => {
    void fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: question.id,
        topic: question.topic,
        part: question.part,
        mode: "recite",
        durationSec: timer.elapsed,
        fullText: store.fullText,
        stats: { ...store.stats, duration: timer.elapsed },
      }),
    });
  };

  function handleStart() {
    store.reset();
    timer.start();
    speech.start();
  }

  function handleStop() {
    speech.stop();
    timer.stop();
    saveSessionRef.current();
  }

  async function generateModelAnswer() {
    setGeneratingAnswer(true);
    try {
      const prompt = getModelAnswerPrompt(question);
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          maxTokens: 600,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setModelAnswer(data.content ?? null);
    } catch {
      setModelAnswer(null);
    } finally {
      setGeneratingAnswer(false);
    }
  }

  const cues = framework?.keyPoints ?? [];
  const expressions = framework?.expressions ?? [];

  return (
    <div className="flex flex-col gap-6">
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

      {/* 题目 */}
      <div className="rounded-2xl border border-border p-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-semibold text-background">
            Part {question.part} · {t("recite.predicted")}
          </span>
          <span className="text-xs font-medium text-tertiary-text">
            {question.topic} · {question.year}
          </span>
        </div>
        <h1 className="text-xl font-semibold leading-relaxed">
          {question.question}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* 左：关键词提示卡 */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-secondary-text">
                {t("recite.reveal")}
              </h3>
              <button
                type="button"
                onClick={() => setShowCues((v) => !v)}
                aria-pressed={showCues}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-150 active:scale-[0.95] ${
                  showCues
                    ? "bg-muted text-foreground"
                    : "text-secondary-text hover:bg-muted hover:text-foreground"
                }`}
                title={showCues ? t("recite.hide") : t("recite.reveal")}
                aria-label={showCues ? t("recite.hide") : t("recite.reveal")}
              >
                {showCues ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {loadingFramework ? (
              <p className="text-sm text-tertiary-text">
                {t("common.loading")}
              </p>
            ) : framework && showCues ? (
              <div className="flex flex-col gap-4">
                {cues.length > 0 ? (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-secondary-text">
                      {t("recite.cues")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cues.map((cue, i) => (
                        <span
                          key={i}
                          className="rounded-lg bg-muted px-2.5 py-1 text-sm"
                        >
                          {cue}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {expressions.length > 0 ? (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-secondary-text">
                      {t("recite.expressions")}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {expressions.map((e, i) => (
                        <div key={i} className="rounded-lg bg-muted px-3 py-1.5 text-sm">
                          <span className="font-medium">{e.phrase}</span>
                          <span className="ml-1.5 text-secondary-text">
                            {e.meaning}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : framework ? (
              <p className="text-sm text-tertiary-text">{t("recite.hint")}</p>
            ) : (
              <p className="text-sm text-tertiary-text">
                {t("recite.noFramework")}
              </p>
            )}
          </div>

          {/* 范文对比 */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border p-5">
            <Button
              variant="secondary"
              onClick={generateModelAnswer}
              loading={generatingAnswer}
              disabled={generatingAnswer}
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              {generatingAnswer ? t("common.loading") : t("recite.compare")}
            </Button>
            {modelAnswer ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary-text">
                {modelAnswer}
              </p>
            ) : null}
          </div>
        </div>

        {/* 右：字幕 + 控制 */}
        <div className="flex flex-col gap-4">
          <div className="min-h-[280px] rounded-2xl border border-border p-5">
            {!speech.supported ? (
              <p className="text-center text-sm text-secondary-text">
                {speech.unsupportedReason === "insecure-context"
                  ? t("practice.micInsecure")
                  : t("practice.micUnsupported")}
              </p>
            ) : store.fullText || store.interimText ? (
              <div className="space-y-3">
                {store.sentences.map((s, i) => (
                  <p
                    key={i}
                    className="text-lg leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: highlightTokens(s, analysisLang) }}
                  />
                ))}
                {store.interimText ? (
                  <p
                    className="text-lg leading-relaxed opacity-60"
                    dangerouslySetInnerHTML={{
                      __html: highlightTokens(store.interimText, analysisLang),
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex h-full min-h-[240px] items-center justify-center">
                <p className="text-center text-sm text-tertiary-text">
                  {t("recite.hint")}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            {speech.state === "idle" || speech.state === "error" ? (
              <Button
                size="lg"
                onClick={handleStart}
                className="rounded-full px-8"
              >
                <Mic className="h-5 w-5" aria-hidden="true" />
                {t("practice.start")}
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleStop}
                className="rounded-full px-8"
              >
                <Square className="h-5 w-5" aria-hidden="true" />
                {t("practice.stop")}
              </Button>
            )}
          </div>

          {/* 麦克风权限错误提示 + 重试 */}
          {speech.error && speech.state === "error" ? (
            <div className="mx-auto max-w-md rounded-xl border border-[var(--filler-color)]/30 bg-[var(--filler-color)]/5 px-4 py-3 text-center">
              <p className="text-sm text-[var(--filler-color)]">
                {speech.error}
              </p>
              {speech.micPermission === "denied" ? (
                <p className="mt-2 text-xs leading-relaxed text-secondary-text">
                  {t("practice.micDenied")}
                </p>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-secondary-text">
                  {t("practice.micPrompt")}
                </p>
              )}
              <Button
                onClick={handleStart}
                className="mt-3"
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
                {t("common.retry")}
              </Button>
            </div>
          ) : null}

          {/* 统计 */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: t("practice.stat.fillers"), value: store.stats.fillers },
              { label: t("practice.stat.hedges"), value: store.stats.hedges },
              { label: t("practice.stat.vague"), value: store.stats.vagueWords },
              { label: t("practice.stat.chinglish"), value: store.stats.chinglish },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-border p-3 text-center"
              >
                <div className="text-xl font-bold tabular-nums">
                  {item.value}
                </div>
                <div className="text-xs text-secondary-text">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
