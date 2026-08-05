"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Mic, Sparkles } from "lucide-react";

import type { Question } from "@/lib/bank";
import { BAND_OPTIONS, DIMENSION_LABELS } from "@/lib/profile";
import type { AbilityProfile } from "@/persistence/schema";
import { SpeechAnswerCard } from "@/components/practice/speech-answer-card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

type Step = "target" | "answer" | "result";

export function OnboardingFlow({ questions }: { questions: Question[] }) {
  const { t } = useT();
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
        setError("请至少完成 2 道题的回答");
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
        throw new Error(data?.error || "诊断失败");
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
      setError(e?.message || "诊断失败，请稍后重试");
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
          <h1 className="text-2xl font-bold tracking-tight">建立你的起点</h1>
          <p className="text-sm text-secondary-text">
            先设定目标分数，再通过简短诊断了解当前水平
          </p>
        </div>

        <div className="rounded-2xl border border-border p-6">
          <h2 className="mb-4 text-base font-semibold">你的雅思口语目标分数</h2>
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
            目标分数决定 AI 反馈的详细程度、推荐词汇难度和目标级回答的水平
          </p>
        </div>

        <button
          type="button"
          onClick={() => setStep("answer")}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-6 py-3 text-base font-medium text-background transition-opacity hover:opacity-90"
        >
          开始诊断
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
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
            已答 {doneCount}
          </span>
        </div>

        {/* 题目卡 */}
        <div className="rounded-2xl border border-border p-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-semibold text-background">
              Part {currentQuestion.part}
            </span>
            <span className="text-xs text-tertiary-text">
              第 {currentIdx + 1} 题 · 无需准备，自然作答
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
          onResult={(text) => handleAnswer(text)}
        />

        {/* 导航 */}
        <div className="flex justify-end">
          {isLast ? (
            <button
              type="button"
              onClick={finishDiagnostic}
              disabled={generating || doneCount < 2}
              className="inline-flex items-center gap-2 rounded-xl bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {generating ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" />
                  正在评估…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  完成诊断
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentIdx((i) => i + 1)}
              disabled={!answeredCurrent}
              className="inline-flex items-center gap-2 rounded-xl bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              下一题
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {error ? (
          <p className="text-center text-sm text-[var(--filler-color)]">
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
            你的能力档案
          </h1>
          <p className="text-sm text-secondary-text">
            这是训练用途的预估水平，不是官方成绩
          </p>
        </div>

        {/* 总分对比 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border p-5 text-center">
            <div className="text-xs font-medium text-tertiary-text">当前水平</div>
            <div className="mt-1 text-3xl font-bold">
              {profile.overallBand.toFixed(1)}
            </div>
          </div>
          <div className="rounded-2xl border border-foreground p-5 text-center">
            <div className="text-xs font-medium text-tertiary-text">目标分数</div>
            <div className="mt-1 text-3xl font-bold">
              {profile.targetBand.toFixed(1)}
            </div>
          </div>
        </div>

        {/* 四维 */}
        <div className="rounded-2xl border border-border p-6">
          <h2 className="mb-4 text-base font-semibold">四维能力</h2>
          <div className="flex flex-col gap-3">
            {([
              ["fluency", dims.fluency],
              ["lexical", dims.lexical],
              ["grammar", dims.grammar],
              ["pronunciation", dims.pronunciation],
            ] as const).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-secondary-text">
                  {DIMENSION_LABELS[key]}
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
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
            <h2 className="mb-3 text-base font-semibold">当前最主要的问题</h2>
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
            <h2 className="mb-3 text-base font-semibold">通往 {profile.targetBand.toFixed(1)} 的阶段路径</h2>
            <ol className="list-inside list-decimal space-y-1.5 text-sm text-secondary-text">
              {profile.stagePath.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => router.push("/bank")}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-6 py-3 text-base font-medium text-background transition-opacity hover:opacity-90"
        >
          开始练习
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return null;
}
