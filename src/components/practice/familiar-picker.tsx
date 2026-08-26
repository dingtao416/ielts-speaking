"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

import type { FamiliarCategory } from "@/lib/bank";
import { useT } from "@/lib/i18n";
import { buttonClass } from "@/components/ui/button";
import { track } from "@/lib/analytics";

/**
 * 熟悉话题大类选择（FR-002）：
 * 选择 工作/学习 | 家乡 | 住所 之一 → 服务端创建冻结会话 → 进入练习。
 */
export function FamiliarPicker({
  categories,
  version,
}: {
  categories: FamiliarCategory[];
  version: string;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(categoryId: string) {
    setCreating(true);
    setError(null);
    track("personal_background_category_selected", { category: categoryId });
    try {
      const res = await fetch("/api/practice-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "personal_background", topicSetKey: categoryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "create failed");
      }
      track("practice_started", {
        mode: "personal_background",
        topicSetKey: categoryId,
      });
      router.push(`/practice/session/${data.session.id}`);
    } catch (e: any) {
      setError(e?.message ?? "create failed");
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <Link
        href="/practice"
        className="inline-flex items-center gap-1.5 text-sm text-secondary-text transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("common.back")}
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("v1.familiar.title")}</h1>
        <p className="text-sm text-secondary-text">{t("v1.familiar.desc")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            disabled={creating}
            onClick={() => void start(category.id)}
            className="flex flex-col gap-3 rounded-2xl border border-border p-6 text-left transition-all duration-150 hover:border-foreground hover:shadow-sm active:scale-[0.99] disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <strong className="text-lg">
              {locale === "zh" ? category.label.zh : category.label.en}
            </strong>
            <span className="text-sm text-tertiary-text">
              {t("v1.familiar.questions", { count: category.questions.length })}
            </span>
          </button>
        ))}
      </div>

      <p className="rounded-xl border border-border bg-muted/20 p-4 text-xs leading-relaxed text-secondary-text">
        {t("v1.familiar.trainingNote")}
        <span className="ml-2 text-tertiary-text">v{version}</span>
      </p>

      {error ? (
        <p role="alert" className="text-sm text-[var(--danger-color)]">
          {error}
        </p>
      ) : null}

      {creating ? (
        <div className="inline-flex items-center gap-2 text-sm text-secondary-text">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("common.loading")}
        </div>
      ) : null}

      <div>
        <Link href="/practice" className={buttonClass("secondary", "md")}>
          {t("v1.home.title")}
        </Link>
      </div>
    </div>
  );
}
