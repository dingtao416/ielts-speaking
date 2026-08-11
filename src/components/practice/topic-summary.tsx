"use client";

import Link from "next/link";
import { ArrowLeft, Check, Loader2, Mic } from "lucide-react";

import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AudioPlayback } from "@/components/ui/audio-playback";
import type {
  RoundRecord,
  TopicSummaryData,
} from "@/components/practice/ai-coach-session";
import {
  VocabLinkedTranscript,
  VocabSummaryList,
  useVocabLinking,
} from "@/components/practice/vocab-linking";

/**
 * S6 话题总结：话题训练预估（训练用途，非官方成绩）+ 判定依据 + 下次优化点
 * + 逐题复盘（每道追问的原始录音/转录稿/推荐回答/词汇汇总/语法改写）。
 * 话题内所有逐题细节的唯一入口。
 */
export function TopicSummary({
  topic,
  records,
  summary,
  summaryLoading = false,
  mode = "session",
  onEnd,
  onNextTopic,
}: {
  topic: string;
  records: RoundRecord[];
  summary?: TopicSummaryData | null;
  summaryLoading?: boolean;
  mode?: "session" | "view";
  onEnd: () => void;
  onNextTopic?: () => void;
}) {
  const { t } = useT();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 py-8">
      <div className="flex items-center justify-between">
        <Link
          href="/bank"
          className="inline-flex items-center gap-1.5 text-sm text-secondary-text transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("common.back")}
        </Link>
        <span className="text-sm font-medium text-secondary-text">{topic}</span>
      </div>

      {/* 话题预估 */}
      <section className="rounded-2xl border-l-4 border-foreground bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{t("aiCoach.topicSummary")}</h1>
            <p className="mt-1 text-sm text-tertiary-text">
              {t("aiCoach.trainingOnly")}
            </p>
          </div>
          {summaryLoading ? (
            <span className="inline-flex items-center gap-2 text-sm text-tertiary-text">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("aiCoach.generating")}
            </span>
          ) : summary ? (
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-secondary-text">
                {t("aiCoach.topicEstimate")}
              </div>
              <div className="text-4xl font-bold tabular-nums">
                {summary.estimate.toFixed(1)}
              </div>
            </div>
          ) : null}
        </div>

        {summary ? (
          <div className="mt-4 flex flex-col gap-3 text-sm">
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-secondary-text">
                {t("aiCoach.summaryBasis")}
              </h3>
              <p className="text-secondary-text">{summary.basis || "—"}</p>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-secondary-text">
                {t("aiCoach.nextFocus")}
              </h3>
              {summary.nextFocus.length ? (
                <ul className="list-inside list-disc space-y-0.5 text-secondary-text">
                  {summary.nextFocus.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-secondary-text">—</p>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-4 border-t border-border pt-3 text-xs text-secondary-text">
          {records.length} {t("aiCoach.answersCount")}
        </div>
      </section>

      {/* 逐题复盘 */}
      <section className="flex flex-col gap-6">
        {records.map((rec, i) => (
          <TopicQuestionReview key={rec.id} rec={rec} index={i} />
        ))}
      </section>

      {/* 操作 */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {mode === "view" ? (
          <Button variant="secondary" onClick={onEnd}>
            {t("aiCoach.back")}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onEnd}>
              {t("aiCoach.endSession")}
            </Button>
            {onNextTopic ? (
              <Button onClick={onNextTopic}>
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("aiCoach.nextTopic")}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** 单题复盘：原始录音 + 转录稿（黄色词汇联动）+ 推荐回答 + 词汇汇总 + 语法/改写，状态按题独立。 */
function TopicQuestionReview({ rec, index }: { rec: RoundRecord; index: number }) {
  const { t } = useT();
  const linking = useVocabLinking();
  return (
    <article className="border-b border-border pb-6">
      <div className="mb-3 flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold leading-snug">{rec.question}</h3>
        <span className="shrink-0 text-xs text-tertiary-text">Q{index + 1}</span>
      </div>

      {/* 原始录音 */}
      {rec.audioUrl ? (
        <div className="mb-3 rounded-lg bg-muted/40 p-3">
          <h4 className="mb-1 text-xs font-semibold text-secondary-text">
            {t("aiCoach.originalRecording")}
          </h4>
          <AudioPlayback src={rec.audioUrl} className="w-full max-w-xs" />
        </div>
      ) : null}

      {/* 转录稿（黄色词汇标记，联动） */}
      {rec.transcript ? (
        <div className="mb-3 rounded-lg bg-muted/40 p-3">
          <h4 className="mb-1 text-xs font-semibold text-secondary-text">
            {t("aiCoach.transcript")}
          </h4>
          <VocabLinkedTranscript
            transcript={rec.transcript}
            handlers={linking.transcriptHandlers}
            className="text-sm leading-relaxed text-foreground"
          />
        </div>
      ) : null}

      {/* 推荐回答 */}
      {rec.recommendedAnswer ? (
        <div className="mb-3 rounded-lg border border-border p-3">
          <h4 className="mb-1 text-xs font-semibold text-secondary-text">
            {t("aiCoach.recommendedAnswer")}
          </h4>
          <p className="text-sm leading-relaxed">{rec.recommendedAnswer}</p>
        </div>
      ) : null}

      {/* 词汇汇总（联动：只显示对应词条） */}
      {rec.vocabularyHighlights.length > 0 ? (
        <div className="mb-3 rounded-lg bg-muted/20 p-3">
          <h4 className="mb-1 text-xs font-semibold text-secondary-text">
            {t("aiCoach.vocabSummary")}
          </h4>
          <VocabSummaryList
            highlights={rec.vocabularyHighlights}
            active={linking.active}
            onItemHover={linking.onItemHover}
            onItemClick={linking.onItemClick}
          />
        </div>
      ) : null}

      {/* 语法 + 改写（复盘详情） */}
      {rec.grammarNotes ? (
        <div className="mb-3 rounded-lg border border-border p-3">
          <h4 className="mb-1 text-xs font-semibold text-secondary-text">
            {t("aiCoach.grammarNotes")}
          </h4>
          <p className="text-sm leading-relaxed text-secondary-text">
            {rec.grammarNotes}
          </p>
        </div>
      ) : null}
      {rec.naturalRewrite ? (
        <div className="rounded-lg border border-border p-3">
          <h4 className="mb-1 text-xs font-semibold text-secondary-text">
            {t("aiCoach.naturalRewrite")}
          </h4>
          <p className="text-sm italic leading-relaxed">{rec.naturalRewrite}</p>
        </div>
      ) : null}
    </article>
  );
}

/** 话题行（结束页/下一话题用） */
export function TopicRow({
  topic,
  count,
  onSelect,
}: {
  topic: string;
  count: number;
  onSelect?: () => void;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-4 border-b border-border py-3 text-left"
    >
      <span>
        <strong className="block text-base">{topic}</strong>
        <span className="block text-sm text-secondary-text">
          {count} {t("aiCoach.answersCount")}
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Mic className="h-4 w-4" aria-hidden="true" />
        {t("aiCoach.startNewTopic")}
      </span>
    </button>
  );
}
