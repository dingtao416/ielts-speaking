"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenText, CalendarDays, Loader2, Lock, Mic } from "lucide-react";

import {
  resolveStandardTopicSet,
  type StandardTopicSet,
} from "@/lib/bank";
import { useT } from "@/lib/i18n";
import { authClient } from "@/auth-client";
import { buttonClass } from "@/components/ui/button";
import { track } from "@/lib/analytics";

type Scope = { kind: "year"; year: number } | { kind: "latest" };

/**
 * 题库页 = 标准话题选择入口（PRD 5.3，基于现有题库页改造）：
 * 年份 / 最新话题 → Part（V1 仅开放 Part 1）→ 已发布标准话题题组。
 * 练习按钮创建冻结会话（FR-003），latest（预测题）保留逐题背记入口。
 */
export function BankBrowser({
  years,
  setsByYear,
  latestSets,
  version,
}: {
  years: number[];
  setsByYear: Record<number, StandardTopicSet[]>;
  latestSets: StandardTopicSet[];
  version: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAuthed = Boolean(session?.user);

  // 默认选中"最新话题"（最常用入口）
  const [scope, setScope] = useState<Scope>({ kind: "latest" });
  const [part, setPart] = useState<number>(1);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topicSets = useMemo<StandardTopicSet[]>(() => {
    if (scope.kind === "latest") return latestSets;
    return setsByYear[scope.year] ?? [];
  }, [scope, latestSets, setsByYear]);

  async function start(setId: string) {
    setCreating(setId);
    setError(null);
    track("standard_topic_selected", { topicSetKey: setId });
    try {
      const res = await fetch("/api/practice-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "standard_topic", topicSetKey: setId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "create failed");
      }
      track("practice_started", { mode: "standard_topic", topicSetKey: setId });
      router.push(`/practice/session/${data.session.id}`);
    } catch (e: any) {
      setError(e?.message ?? "create failed");
      setCreating(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 当前选择（层级提示） */}
      <div
        className="flex flex-wrap items-center gap-1.5 text-sm text-secondary-text"
        aria-label={t("bank.currentSelection")}
      >
        <span className="font-medium">
          {scope.kind === "latest" ? t("v1.standard.latest") : scope.year}
        </span>
        <span className="text-tertiary-text" aria-hidden="true">/</span>
        <span className="font-medium">Part {part}</span>
      </div>

      {/* 第一步：年份 / 最新话题（并列，PRD 5.3） */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary-text">
          {t("v1.standard.scopeStep")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={scope.kind === "latest"}
            onClick={() => setScope({ kind: "latest" })}
            className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-base font-semibold transition-colors ${
              scope.kind === "latest"
                ? "bg-foreground text-background"
                : "border border-border text-secondary-text hover:border-foreground hover:text-foreground"
            }`}
          >
            <BookOpenText className="h-4 w-4" aria-hidden="true" />
            {t("v1.standard.latest")}
            <span className="text-xs font-medium opacity-70">
              {t("v1.standard.latestDesc")}
            </span>
          </button>
          {years.map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={scope.kind === "year" && scope.year === y}
              onClick={() => setScope({ kind: "year", year: y })}
              className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-base font-semibold transition-colors ${
                scope.kind === "year" && scope.year === y
                  ? "bg-foreground text-background"
                  : "border border-border text-secondary-text hover:border-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {y}
            </button>
          ))}
        </div>
      </section>

      {/* 第二步：Part（V1 仅 Part 1，2/3 未开放） */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary-text">
          {t("v1.standard.partStep")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={part === 1}
            onClick={() => setPart(1)}
            className={`rounded-xl px-5 py-3 text-base font-semibold transition-colors ${
              part === 1
                ? "bg-foreground text-background"
                : "border border-border text-secondary-text hover:border-foreground hover:text-foreground"
            }`}
          >
            Part 1
          </button>
          {[2, 3].map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-5 py-3 text-base font-semibold text-tertiary-text"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              Part {p} · {t("v1.standard.partLocked")}
            </span>
          ))}
        </div>
      </section>

      {/* 第三步：已发布标准话题题组 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-secondary-text">
            {t("v1.standard.topicStep")}
          </h2>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-tertiary-text">
            v{version}
          </span>
        </div>

        {topicSets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-tertiary-text">
            {t("v1.standard.empty")}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {topicSets.map((set) => {
              const resolved = resolveStandardTopicSet(set);
              const isLatest = set.scope === "latest";
              return (
                <div
                  key={set.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border p-6"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                          Part {set.part}
                        </span>
                        {isLatest ? (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                            {t("v1.standard.latest")}
                          </span>
                        ) : (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                            {set.year}
                          </span>
                        )}
                      </div>
                      <strong className="text-lg">{set.topic}</strong>
                      <span className="text-xs text-tertiary-text">
                        {t("v1.standard.topicDesc", { count: resolved.questions.length })} ·{" "}
                        {t("v1.standard.source", { source: set.source })}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={creating !== null || !isAuthed}
                      onClick={() => void start(set.id)}
                      className={buttonClass("primary", "md")}
                    >
                      {creating === set.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Mic className="h-4 w-4" aria-hidden="true" />
                      )}
                      {isAuthed ? t("bank.practice") : t("bank.needSignIn")}
                    </button>
                  </div>

                  {/* 组内题目预览（固定顺序）；latest 题保留背记入口 */}
                  <ol className="flex flex-col gap-1.5 border-t border-border pt-4">
                    {resolved.questions.map((q, i) => (
                      <li
                        key={q.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 flex-1 leading-relaxed text-secondary-text">
                          <span className="mr-2 text-xs tabular-nums text-tertiary-text">
                            {i + 1}.
                          </span>
                          {q.question}
                        </span>
                        {isLatest ? (
                          <Link
                            href={`/recite/${encodeURIComponent(q.id)}`}
                            className={buttonClass("secondary", "sm")}
                          >
                            {t("bank.recite")}
                          </Link>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-[var(--danger-color)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
