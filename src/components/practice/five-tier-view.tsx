"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

export interface FiveTierData {
  original: string;
  structured: string;
  improvable: string;
  target: string;
  steps: string[];
  focus: string;
  targetBand?: number;
  currentBand?: number;
}

const TIERS = [
  {
    key: "original",
    title: "① 你的原文",
    subtitle: "Original",
    color: "text-secondary-text",
    bg: "bg-muted/40",
  },
  {
    key: "structured",
    title: "② 结构化",
    subtitle: "Structured",
    color: "text-foreground",
    bg: "bg-muted/40",
  },
  {
    key: "improvable",
    title: "③ 可改进版",
    subtitle: "Improve & fix",
    color: "text-foreground",
    bg: "bg-muted/40",
  },
  {
    key: "target",
    title: "④ 目标级回答",
    subtitle: "Target band",
    color: "text-green-700 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/40",
  },
] as const;

export function FiveTierView({
  data,
  loading,
  error,
  onGenerate,
}: {
  data: FiveTierData | null;
  loading: boolean;
  error?: string | null;
  onGenerate: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>("target");

  if (!data) {
    return (
      <div className="rounded-2xl border border-border p-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-foreground" aria-hidden="true" />
            <h3 className="text-base font-semibold">目标级回答</h3>
          </div>
          <p className="text-sm text-secondary-text">
            根据你的当前水平，生成从原文到目标分的升级回答
          </p>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {loading ? "生成中…" : "生成目标级回答"}
          </button>
          {error ? (
            <p className="text-sm text-[var(--filler-color)]">{error}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const toggle = (key: string) =>
    setExpanded((cur) => (cur === key ? null : key));

  return (
    <div className="rounded-2xl border border-border p-6">
      <div className="mb-4 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-foreground" aria-hidden="true" />
          <h3 className="text-base font-semibold">目标级回答</h3>
          {data.currentBand !== undefined && data.targetBand !== undefined ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
              当前 {data.currentBand.toFixed(1)} → 目标 {data.targetBand.toFixed(1)}
            </span>
          ) : null}
        </div>
        {data.focus ? (
          <p className="text-sm text-secondary-text">{data.focus}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {TIERS.map((tier) => {
          const content = data[tier.key];
          const isOpen = expanded === tier.key;
          return (
            <div
              key={tier.key}
              className={`rounded-xl border border-border ${tier.bg} overflow-hidden`}
            >
              <button
                type="button"
                onClick={() => toggle(tier.key)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${tier.color}`}>
                    {tier.title}
                  </span>
                  <span className="text-xs text-tertiary-text">
                    {tier.subtitle}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-secondary-text" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-secondary-text" aria-hidden="true" />
                )}
              </button>
              {isOpen && content ? (
                <p className="whitespace-pre-wrap px-4 pb-4 text-sm leading-relaxed text-foreground">
                  {content}
                </p>
              ) : null}
            </div>
          );
        })}

        {/* 提升步骤 */}
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="mb-2 text-sm font-semibold">⑤ 提升步骤</div>
          <ol className="list-inside list-decimal space-y-1 text-sm text-secondary-text">
            {data.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
