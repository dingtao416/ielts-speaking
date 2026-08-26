"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Sparkles } from "lucide-react";

import { BAND_OPTIONS } from "@/lib/profile";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

/**
 * V1 首次诊断（D-5 已确认，FR-009）：
 * 1. 设置/确认最终目标分
 * 2. 创建固定 8 道标准题诊断包会话（2 个标准话题 × 4 题，不含熟悉话题）
 * 3. 进入练习运行器逐题完成；完成后生成能力档案
 */
export function OnboardingFlow() {
  const { t } = useT();
  const router = useRouter();

  const [targetBand, setTargetBand] = useState<number>(6.5);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDiagnostic() {
    setCreating(true);
    setError(null);
    try {
      // 保存最终目标分
      const profileRes = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalGoalBand: targetBand }),
      });
      if (!profileRes.ok) throw new Error(t("onboarding.error.diagnostic"));

      // 创建 8 题诊断包会话
      const res = await fetch("/api/practice-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "standard_topic",
          topicSetKey: "diagnostic",
          diagnostic: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("onboarding.error.diagnostic"));
      track("diagnostic_started", { sessionId: data.session.id });
      track("practice_started", { mode: "standard_topic", diagnostic: true });
      router.push(`/practice/session/${data.session.id}`);
    } catch (e: any) {
      setError(e?.message ?? t("onboarding.error.diagnostic"));
      setCreating(false);
    }
  }

  return (
    <div className="animate-fade-in mx-auto flex max-w-xl flex-col gap-8 py-8">
      <div className="flex flex-col gap-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
          <Mic className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t("onboarding.step1.title")}</h1>
        <p className="text-sm text-secondary-text">{t("onboarding.step1.desc")}</p>
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
        <p className="mt-4 text-xs text-tertiary-text">{t("onboarding.step1.targetHint")}</p>
      </div>

      <div className="rounded-2xl border border-border bg-muted/20 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {t("onboarding.v1.packageTitle")}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-secondary-text">
          {t("onboarding.v1.packageDesc")}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--danger-color)]">
          {error}
        </p>
      ) : null}

      <Button size="lg" onClick={() => void startDiagnostic()} disabled={creating}>
        {creating ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Mic className="h-5 w-5" aria-hidden="true" />
        )}
        {t("onboarding.step1.start")}
      </Button>
    </div>
  );
}
