"use client";

import Link from "next/link";
import { BookOpenText, Sparkles } from "lucide-react";

import { useT } from "@/lib/i18n";
import { track } from "@/lib/analytics";

/** 练习首页：熟悉话题 / 标准话题 二选一入口（FR-001） */
export function PracticeHome() {
  const { t } = useT();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("v1.home.title")}</h1>
        <p className="text-sm text-secondary-text">{t("v1.home.desc")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 熟悉话题 */}
        <Link
          href="/practice/familiar"
          onClick={() => track("practice_mode_selected", { mode: "personal_background" })}
          className="group flex flex-col gap-4 rounded-2xl border border-border p-6 transition-all duration-150 hover:border-foreground hover:shadow-sm active:scale-[0.99]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold">{t("v1.home.familiar")}</h2>
            <p className="text-sm leading-relaxed text-secondary-text">
              {t("v1.home.familiar.desc")}
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-secondary-text">
            {t("v1.home.familiar.badge")}
          </span>
          <span className="mt-auto text-sm font-semibold text-foreground" aria-hidden="true">
            →
          </span>
        </Link>

        {/* 标准话题：入口 = 现有题库页（年份/最新话题 → Part → 话题） */}
        <Link
          href="/bank"
          onClick={() => track("practice_mode_selected", { mode: "standard_topic" })}
          className="group flex flex-col gap-4 rounded-2xl border border-border p-6 transition-all duration-150 hover:border-foreground hover:shadow-sm active:scale-[0.99]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-background">
            <BookOpenText className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold">{t("v1.home.standard")}</h2>
            <p className="text-sm leading-relaxed text-secondary-text">
              {t("v1.home.standard.desc")}
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-secondary-text">
            {t("v1.home.standard.badge")}
          </span>
          <span className="mt-auto text-sm font-semibold text-foreground" aria-hidden="true">
            →
          </span>
        </Link>
      </div>
    </div>
  );
}
