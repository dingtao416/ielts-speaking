"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, FolderOpen, Lock, Mic } from "lucide-react";

import { getQuestions, getTopicsByYear } from "@/lib/bank";
import type { Question } from "@/lib/bank";
import { useT } from "@/lib/i18n";
import { authClient } from "@/auth-client";
import { buttonClass } from "@/components/ui/button";

const PARTS = [1, 2, 3] as const;

export function BankBrowser({
  realYears,
  predictedYears,
}: {
  realYears: number[];
  predictedYears: number[];
}) {
  const { t } = useT();
  const { data: session } = authClient.useSession();
  const isAuthed = Boolean(session?.user);

  // 层级 1：真题/预测题
  const [category, setCategory] = useState<"real" | "predicted">("real");
  // 层级 2：年份（默认选中最新年份，话题随之联动）
  const initialYear = category === "real" ? (realYears[0] ?? 0) : (predictedYears[0] ?? 0);
  const [year, setYear] = useState<number>(initialYear);
  // 层级 3：话题（依赖所选年份）
  const [topic, setTopic] = useState<string>("");
  // Part 小筛选
  const [part, setPart] = useState<number>(0);

  const years = category === "real" ? realYears : predictedYears;

  // 该年份下的话题（随年份联动）
  const yearTopics = useMemo(() => {
    if (!year) return [];
    return getTopicsByYear(category, year);
  }, [category, year]);

  // 最终题目：年份 + 话题 + part
  const questions = useMemo(() => {
    return getQuestions(category, {
      year: year || undefined,
      topic: topic || undefined,
      part: part || undefined,
    });
  }, [category, year, topic, part]);

  function switchCategory(next: "real" | "predicted") {
    setCategory(next);
    // 切换分类后默认选中该分类的最新年份
    setYear(next === "real" ? (realYears[0] ?? 0) : (predictedYears[0] ?? 0));
    setTopic("");
    setPart(0);
  }

  function selectYear(y: number) {
    setYear(y);
    setTopic("");
    setPart(0);
  }

  function practiceHref(q: Question) {
    // PRD：按话题进入 AI 逐题会话练习
    return `/practice/topic/${encodeURIComponent(q.topic)}`;
  }
  function reciteHref(q: Question) {
    return `/recite/${q.id}`;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 分类切换：真题 / 预测题 */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted p-1 w-fit">
        <button
          type="button"
          onClick={() => switchCategory("real")}
          aria-pressed={category === "real"}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
            category === "real"
              ? "bg-background text-foreground shadow-sm"
              : "text-secondary-text hover:text-foreground"
          }`}
        >
          {t("bank.real")}
        </button>
        <button
          type="button"
          onClick={() => switchCategory("predicted")}
          aria-pressed={category === "predicted"}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
            category === "predicted"
              ? "bg-background text-foreground shadow-sm"
              : "text-secondary-text hover:text-foreground"
          }`}
        >
          {t("bank.predicted")}
          <span className="ml-1.5 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
            {predictedYears[0] ?? ""}
          </span>
        </button>
      </div>

      {/* 当前选择（面包屑）：让用户知道处在筛选的哪一层 */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-secondary-text" aria-label={t("bank.currentSelection")}>
        <span className="font-medium">
          {category === "real" ? t("bank.real") : t("bank.predicted")}
        </span>
        {year ? (
          <>
            <span className="text-tertiary-text" aria-hidden="true">/</span>
            <span className="font-medium">{year}</span>
          </>
        ) : null}
        {topic ? (
          <>
            <span className="text-tertiary-text" aria-hidden="true">/</span>
            <span className="font-medium">{topic}</span>
          </>
        ) : null}
        {part ? (
          <>
            <span className="text-tertiary-text" aria-hidden="true">/</span>
            <span className="font-medium">Part {part}</span>
          </>
        ) : null}
      </div>

      {/* 层级 1：年份 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-secondary-text" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-secondary-text">
            {t("bank.tier.year")}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => selectYear(y)}
              className={`rounded-xl px-5 py-3 text-base font-semibold transition-colors ${
                year === y
                  ? "bg-foreground text-background"
                  : "border border-border text-secondary-text hover:border-foreground hover:text-foreground"
              }`}
            >
              {y}
              {category === "predicted" && y === years[0] ? (
                <span className="ml-1.5 text-xs font-medium opacity-70">
                  {t("bank.predicted")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {/* 层级 2：话题（随年份联动） */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-secondary-text" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-secondary-text">
            {t("bank.tier.topic")}
          </h3>
          {year ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
              {year}
            </span>
          ) : null}
        </div>

        {year === 0 ? (
          <div className="animate-fade-in rounded-2xl border border-dashed border-border px-5 py-8 text-center">
            <p className="text-sm text-tertiary-text">
              {t("bank.tier.selectYearFirst")}
            </p>
          </div>
        ) : (
          <div key={year} className="animate-fade-in flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTopic("")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                topic === ""
                  ? "bg-foreground text-background"
                  : "border border-border text-secondary-text hover:border-foreground hover:text-foreground"
              }`}
            >
              {t("bank.topic.all")}
            </button>
            {yearTopics.map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setTopic(tp === topic ? "" : tp)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                  topic === tp
                    ? "bg-foreground text-background"
                    : "border border-border text-secondary-text hover:border-foreground hover:text-foreground"
                }`}
              >
                {tp}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Part 小筛选（在题目列表上方） */}
      {year !== 0 && questions.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-tertiary-text">
            Part:
          </span>
          <div className="flex gap-0.5 rounded-xl border border-border p-0.5">
            <button
              type="button"
              onClick={() => setPart(0)}
              className={`rounded-lg px-3 py-1 text-sm transition-all duration-150 active:scale-[0.98] ${
                part === 0
                  ? "bg-foreground text-background"
                  : "text-secondary-text hover:text-foreground"
              }`}
            >
              {t("bank.allParts")}
            </button>
            {PARTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPart(p)}
                className={`rounded-lg px-3 py-1 text-sm transition-all duration-150 active:scale-[0.98] ${
                  part === p
                    ? "bg-foreground text-background"
                    : "text-secondary-text hover:text-foreground"
                }`}
              >
                Part {p}
              </button>
            ))}
          </div>
          {topic ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-secondary-text">
              {topic}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* 题目列表 */}
      {year !== 0 ? (
        part !== 0 && part !== 1 ? (
          <div className="animate-fade-in flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
            <Lock className="h-8 w-8 text-tertiary-text" aria-hidden="true" />
            <p className="text-sm text-secondary-text">{t("bank.partLockedHint")}</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
            <BookOpen className="h-8 w-8 text-tertiary-text" aria-hidden="true" />
            <p className="text-sm text-secondary-text">{t("bank.empty")}</p>
          </div>
        ) : (
          <div key={`${year}-${topic}-${part}`} className="animate-fade-in flex flex-col gap-3">
            {questions.map((q) => (
              <div
                key={q.id}
                className="flex flex-col gap-3 rounded-2xl border border-border p-6 transition-shadow hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                      Part {q.part}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                      {q.year}
                    </span>
                    <span className="text-xs font-medium text-tertiary-text">
                      {q.topic}
                    </span>
                  </div>
                  <p className="text-base font-medium leading-relaxed">
                    {q.question}
                  </p>
                  {q.cueCard ? (
                    <ul className="list-inside list-disc text-sm text-secondary-text">
                      {q.cueCard.slice(0, 2).map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                      {q.cueCard.length > 2 ? (
                        <li className="text-tertiary-text">…</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {q.part !== 1 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-tertiary-text">
                      <Lock className="h-4 w-4" aria-hidden="true" />
                      {t("bank.partLocked")}
                    </span>
                  ) : (
                    <Link
                      href={practiceHref(q)}
                      className={buttonClass("primary", "md")}
                    >
                      <Mic className="h-4 w-4" aria-hidden="true" />
                      {isAuthed ? t("bank.practice") : t("bank.needSignIn")}
                    </Link>
                  )}
                  {q.predicted ? (
                    <Link
                      href={reciteHref(q)}
                      className={buttonClass("secondary", "md")}
                    >
                      {t("bank.recite")}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
