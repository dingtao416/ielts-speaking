"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Mic, Sparkles } from "lucide-react";

import type { Question } from "@/lib/bank";
import { BAND_OPTIONS, DIMENSION_LABELS, DIMENSION_LABELS_EN } from "@/lib/profile";
import type { AbilityProfile } from "@/persistence/schema";
import { SpeechAnswerCard } from "@/components/practice/speech-answer-card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

type Step = "target" | "answer" | "result";

export function OnboardingFlow({ questions }: { questions: Question[] }) {
  const { t, locale } = useT();
  const router = useRouter();

  const [step, setStep] = useState<Step>("target");
  const [targetBand, setTargetBand] = useState<number>(6.5);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [profile, setProfile] = useState<AbilityProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion = questions[currentIdx];

  function handleAnswer(text: string) {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.part]: text,
    }));
  }

  async function finishDiagnostic() {
    setGenerating(true);
    setError(null);
    try {
      const answerList = questions
        .map((q) => ({
          part: q.part,
          question: q.question,
          text: answers[q.part] ?? "",
        }))
        .filter((a) => a.text.trim().length > 0);

      if (answerList.length < 2) {
        setError(t("onboarding.error.minAnswers"));
        setGenerating(false);
        return;
      }

      const res = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answerList, targetBand }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("onboarding.error.diagnostic"));
      }
      const data = await res.json();
      setProfile(data.profile);

      // 保存到用户表
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetBand,
          profile: data.profile,
          onboarded: true,
        }),
      });

      setStep("result");
    } catch (e: any) {
      setError(e?.message || t("onboarding.error.diagnostic"));
    } finally {
      setGenerating(false);
    }
  }

  // ===== 步骤 1：设目标分 =====
  if (step === "target") {
    return (
      <div className="animate-fade-in mx-auto flex max-w-xl flex-col gap-8 py-8">
        <div className="flex flex-col gap-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
            <Mic className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t("onboarding.step1.title")}</h1>
          <p className="text-sm text-secondary-text">
            {t("onboarding.step1.desc")}
          </p>
        </div>

        <div className="rounded-2xl border border-border p-6">
          <h2 className="mb-4 text-base font-semibold">{t("onboarding.step1.targetLabel")}</h2>
          <div className="grid grid-cols-4 gap-2">
            {BAND_OPTIONS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setTargetBand(b)}
                aria-pressed={targetBand === b}
                className={`rounded-xl px-4 py-3 text-lg font-bold transition-all duration-150 active:scale-[0.98] ${
                  targetBand === b
                    ? "bg-foreground text-background"
                    : "border border-border text-secondary-text hover:border-foreground hover:text-foreground"
                }`}
              >
                {b.toFixed(1)}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-tertiary-text">
            {t("onboarding.step1.targetHint")}
          </p>
        </div>

        <Button size="lg" onClick={() => setStep("answer")}>
          {t("onboarding.step1.start")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  // ===== 步骤 2：答题 =====
  if (step === "answer") {
    const doneCount = Object.values(answers).filter((a) => a && a.trim()).length;
    const isLast = currentIdx === questions.length - 1;
    const answeredCurrent = Boolean(
      answers[currentQuestion.part]?.trim(),
    );

    return (
      <div className="animate-fade-in mx-auto flex max-w-xl flex-col gap-6 py-8">
        {/* 进度 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-secondary-text">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                currentIdx > 0
                  ? setCurrentIdx((i) => i - 1)
                  : setStep("target")
              }
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("common.back")}
            </Button>
          </div>
          <span className="text-sm text-secondary-text">
            {currentIdx + 1} / {questions.length}
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
            {t("onboarding.answer.answered", { done: doneCount })}
          </span>
        </div>

        {/* 题目卡 */}
        <div className="rounded-2xl border border-border p-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-semibold text-background">
              Part {currentQuestion.part}
            </span>
            <span className="text-xs text-tertiary-text">
              {t("onboarding.answer.questionIndex", { index: currentIdx + 1 })}
            </span>
          </div>
          <h1 className="text-lg font-semibold leading-relaxed">
            {currentQuestion.question}
          </h1>
          {currentQuestion.cueCard ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-secondary-text">
              {currentQuestion.cueCard.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* 答题 */}
        <SpeechAnswerCard
          key={currentQuestion.id}
          question={currentQuestion.question}
          lang="en-US"
          onResult={(text) => handleAnswer(text)}
        />

        {/* 导航 */}
        <div className="flex justify-end">
          {isLast ? (
            <Button
              size="lg"
              onClick={finishDiagnostic}
              disabled={doneCount < 2}
              loading={generating}
            >
              {generating ? (
                t("onboarding.answer.assessing")
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t("onboarding.answer.finish")}
                </>
              )}
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => setCurrentIdx((i) => i + 1)}
              disabled={!answeredCurrent}
            >
              {t("onboarding.answer.next")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>

        {error ? (
          <p className="text-center text-sm text-[var(--danger-color)]">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // ===== 步骤 3：结果 =====
  if (step === "result" && profile) {
    const dims = profile.dimensions;
    return (
      <div className="animate-fade-in mx-auto flex max-w-xl flex-col gap-6 py-8">
        <div className="flex flex-col gap-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("onboarding.result.title")}
          </h1>
          <p className="text-sm text-secondary-text">
            {t("onboarding.result.desc")}
          </p>
        </div>

        {/* 总分对比 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border p-5 text-center">
            <div className="text-xs font-medium text-tertiary-text">{t("onboarding.result.current")}</div>
            <div className="mt-1 text-3xl font-bold">
              {profile.overallBand.toFixed(1)}
            </div>
          </div>
          <div className="rounded-2xl border border-foreground p-5 text-center">
            <div className="text-xs font-medium text-tertiary-text">{t("onboarding.result.target")}</div>
            <div className="mt-1 text-3xl font-bold">
              {profile.targetBand.toFixed(1)}
            </div>
          </div>
        </div>

        {/* 四维 */}
        <div className="rounded-2xl border border-border p-6">
          <h2 className="mb-4 text-base font-semibold">{t("onboarding.result.dimensions")}</h2>
          <div className="flex flex-col gap-3">
            {([
              ["fluency", dims.fluency],
              ["lexical", dims.lexical],
              ["grammar", dims.grammar],
              ["pronunciation", dims.pronunciation],
            ] as const).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-secondary-text">
                  {locale === "zh" ? DIMENSION_LABELS[key] : DIMENSION_LABELS_EN[key]}
                </span>
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={9}
                    aria-valuenow={val}
                    aria-label={locale === "zh" ? DIMENSION_LABELS[key] : DIMENSION_LABELS_EN[key]}
                  >
                    <div
                      className="h-full bg-foreground"
                      style={{ width: `${(val / 9) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-bold">
                    {val.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 主要问题 */}
        {profile.mainIssues.length > 0 ? (
          <div className="rounded-2xl border border-border p-6">
            <h2 className="mb-3 text-base font-semibold">{t("onboarding.result.issues")}</h2>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-secondary-text">
              {profile.mainIssues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 阶段路径 */}
        {profile.stagePath.length > 0 ? (
          <div className="rounded-2xl border border-border p-6">
            <h2 className="mb-3 text-base font-semibold">
              {t("onboarding.result.stagePath", { target: profile.targetBand.toFixed(1) })}
            </h2>
            <ol className="list-inside list-decimal space-y-1.5 text-sm text-secondary-text">
              {profile.stagePath.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}

        <Button size="lg" onClick={() => router.push("/bank")}>
          {t("onboarding.result.startPractice")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return null;
}
