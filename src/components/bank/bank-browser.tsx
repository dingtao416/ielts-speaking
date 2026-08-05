"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Mic } from "lucide-react";

import { getQuestions } from "@/lib/bank";
import type { Question } from "@/lib/bank";
import { useT } from "@/lib/i18n";
import { authClient } from "@/auth-client";

const PARTS = [1, 2, 3] as const;

export function BankBrowser({
  realYears,
  predictedYears,
  realTopics,
  predictedTopics,
}: {
  realYears: number[];
  predictedYears: number[];
  realTopics: string[];
  predictedTopics: string[];
}) {
  const { t } = useT();
  const { data: session } = authClient.useSession();
  const isAuthed = Boolean(session?.user);

  const [category, setCategory] = useState<"real" | "predicted">("real");
  const [part, setPart] = useState<number>(0);
  const [year, setYear] = useState<number>(0);
  const [topic, setTopic] = useState<string>("");

  const years = category === "real" ? realYears : predictedYears;
  const topics = category === "real" ? realTopics : predictedTopics;

  const questions = useMemo(() => {
    return getQuestions(category, {
      part: part || undefined,
      year: year || undefined,
      topic: topic || undefined,
    });
  }, [category, part, year, topic]);

  function practiceHref(q: Question) {
    return `/practice/${q.id}`;
  }
  function reciteHref(q: Question) {
    return `/recite/${q.id}`;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 分类切换 */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted p-1 w-fit">
        <button
          type="button"
          onClick={() => {
            setCategory("real");
            setYear(0);
            setTopic("");
          }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            category === "real"
              ? "bg-background text-foreground shadow-sm"
              : "text-secondary-text hover:text-foreground"
          }`}
        >
          {t("bank.real")}
        </button>
        <button
          type="button"
          onClick={() => {
            setCategory("predicted");
            setYear(0);
            setTopic("");
          }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
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

      {/* 筛选行 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Part */}
        <div className="flex gap-0.5 rounded-xl border border-border p-0.5">
          <button
            type="button"
            onClick={() => setPart(0)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
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
              className={`rounded-lg px-3 py-1.5 text-sm ${
                part === p
                  ? "bg-foreground text-background"
                  : "text-secondary-text hover:text-foreground"
              }`}
            >
              Part {p}
            </button>
          ))}
        </div>

        {/* 年份 */}
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
        >
          <option value={0}>{t("bank.year.all")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {/* 话题 */}
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">{t("bank.topic.all")}</option>
          {topics.map((tp) => (
            <option key={tp} value={tp}>
              {tp}
            </option>
          ))}
        </select>
      </div>

      {/* 题目列表 */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <BookOpen className="h-8 w-8 text-tertiary-text" aria-hidden="true" />
          <p className="text-sm text-secondary-text">{t("bank.empty")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {questions.map((q) => (
            <div
              key={q.id}
              className="flex flex-col gap-3 rounded-2xl border border-border p-5 transition-shadow hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
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
                <Link
                  href={practiceHref(q)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  {isAuthed ? t("bank.practice") : t("bank.needSignIn")}
                </Link>
                {q.predicted ? (
                  <Link
                    href={reciteHref(q)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    {t("bank.recite")}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
