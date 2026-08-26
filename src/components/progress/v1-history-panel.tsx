"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, RotateCcw, Trash2 } from "lucide-react";

import { useT } from "@/lib/i18n";
import { getFamiliarSet } from "@/lib/bank";
import type { SessionSummary, VocabularyHighlight } from "@/persistence/schema";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { track } from "@/lib/analytics";

interface SessionListItem {
  id: string;
  mode: "personal_background" | "standard_topic";
  topicSetKey: string;
  bankVersion: string;
  diagnosticEligible: boolean;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  endedAt: string | null;
  summary: SessionSummary | null;
  topicName: string | null;
  deliveryCount: number;
  answeredCount: number;
}

interface ReviewAttempt {
  id: string;
  questionDeliveryId: string;
  finalTranscript: string;
  endedBy: string;
  audioRef: string | null;
  feedback: {
    status: string;
    vocabularyHighlights: VocabularyHighlight[];
    naturalRewrite: string | null;
  } | null;
}

interface ReviewData {
  session: SessionListItem;
  deliveries: { id: string; orderNo: number; textSnapshot: string; topic: string }[];
  attempts: ReviewAttempt[];
}

function formatDate(iso: string, locale: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function topicLabelFor(session: SessionListItem, locale: string): string {
  if (session.mode === "personal_background") {
    const category = getFamiliarSet(session.topicSetKey);
    if (category) return locale === "zh" ? category.label.zh : category.label.en;
  }
  return session.topicName ?? session.topicSetKey;
}

/** V1 历史：按话题类型分组、先复盘、主动"再练一次"、可删除（FR-010） */
export function V1HistoryPanel() {
  const { t, locale } = useT();
  const router = useRouter();

  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<SessionListItem | null>(null);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/practice-sessions");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setError(t("common.error"));
    }
  }, [t]);

  useEffect(() => {
    void load();
    track("history_opened");
  }, [load]);

  async function openReview(session: SessionListItem) {
    setReviewing(session);
    setReviewData(null);
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/practice-sessions/${session.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error();
      setReviewData(data);
    } catch {
      setReviewData(null);
    } finally {
      setReviewLoading(false);
    }
  }

  async function repractice(session: SessionListItem) {
    track("repractice_started", { mode: session.mode, topicSetKey: session.topicSetKey });
    const res = await fetch("/api/practice-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: session.mode, topicSetKey: session.topicSetKey }),
    });
    const data = await res.json();
    if (res.ok && data.session) {
      router.push(`/practice/session/${data.session.id}`);
    }
  }

  async function removeSession(session: SessionListItem) {
    await fetch(`/api/practice-sessions/${session.id}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    track("record_deleted", { sessionId: session.id, mode: session.mode });
    setSessions((prev) => prev?.filter((s) => s.id !== session.id) ?? null);
  }

  if (sessions === null) {
    return (
      <section className="rounded-2xl border border-border p-6">
        <h2 className="mb-4 text-base font-semibold">{t("v1.history.title")}</h2>
        <div className="flex justify-center py-8 text-secondary-text">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
      </section>
    );
  }

  const familiar = sessions.filter((s) => s.mode === "personal_background");
  const standard = sessions.filter((s) => s.mode === "standard_topic");

  const renderGroup = (label: string, group: SessionListItem[]) =>
    group.length === 0 ? null : (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-secondary-text">{label}</h3>
        {group.map((session) => {
          const label = topicLabelFor(session, locale);
          return (
            <div
              key={session.id}
              className="flex flex-col gap-3 rounded-2xl border border-border p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-base">{label}</strong>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                    {session.status === "completed"
                      ? t("v1.history.status.completed")
                      : session.status === "in_progress"
                        ? t("v1.history.status.in_progress")
                        : "—"}
                  </span>
                  {session.mode === "standard_topic" && session.summary?.estimate != null ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                      {t("v1.history.estimate", { band: Number(session.summary.estimate).toFixed(1) })}
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-tertiary-text">
                  {t("v1.history.answers", {
                    done: session.answeredCount,
                    total: session.deliveryCount,
                  })}{" "}
                  · {formatDate(session.startedAt, locale)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void openReview(session)}>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  {t("v1.history.review")}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void repractice(session)}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {t("v1.session.summary.repractice")}
                </Button>
                {confirmDeleteId === session.id ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void removeSession(session)}
                    onBlur={() => setConfirmDeleteId(null)}
                  >
                    {t("v1.history.confirmDelete")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDeleteId(session.id)}
                    title={t("v1.history.delete")}
                    aria-label={t("v1.history.delete")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );

  return (
    <section className="rounded-2xl border border-border p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("v1.history.title")}</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-secondary-text transition-colors hover:text-foreground"
        >
          {t("common.retry")}
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className="py-8 text-center text-sm text-tertiary-text">{t("v1.history.empty")}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {renderGroup(t("v1.home.familiar"), familiar)}
          {renderGroup(t("v1.home.standard"), standard)}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-[var(--danger-color)]">
          {error}
        </p>
      ) : null}

      {/* 复盘弹窗：先复盘，再练由用户主动触发 */}
      <Modal
        open={Boolean(reviewing)}
        onClose={() => {
          setReviewing(null);
          setReviewData(null);
        }}
        labelledBy="v1-review-title"
        maxWidth="max-w-2xl"
      >
        {reviewLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : reviewData ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="v1-review-title" className="text-xl font-bold">
                {t("v1.history.reviewTitle")}
              </h2>
              {reviewData.session.mode === "standard_topic" &&
              reviewData.session.summary?.estimate != null ? (
                <span className="rounded-lg bg-muted px-3 py-1 text-sm font-semibold">
                  {t("v1.history.estimate", {
                    band: Number(reviewData.session.summary.estimate).toFixed(1),
                  })}
                </span>
              ) : null}
            </div>

            {reviewData.session.summary?.basis ? (
              <p className="rounded-xl bg-muted/20 p-3 text-sm leading-relaxed text-secondary-text">
                {reviewData.session.summary.basis}
              </p>
            ) : null}

            {reviewData.deliveries.map((delivery) => {
              const attempt = reviewData.attempts.find(
                (a) => a.questionDeliveryId === delivery.id,
              );
              const skipped = attempt?.endedBy === "skipped";
              return (
                <div key={delivery.id} className="flex flex-col gap-2 rounded-2xl border border-border p-5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                      {t("v1.history.reviewQuestion", { index: delivery.orderNo })}
                    </span>
                    {skipped ? (
                      <span className="text-xs text-tertiary-text">
                        {t("v1.history.reviewSkipped")}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-base font-medium leading-relaxed">{delivery.textSnapshot}</p>
                  {attempt && !skipped ? (
                    <>
                      <p className="text-sm leading-relaxed text-secondary-text">
                        {attempt.finalTranscript}
                      </p>
                      {attempt.feedback?.vocabularyHighlights?.length ? (
                        <ul className="flex flex-wrap gap-2">
                          {attempt.feedback.vocabularyHighlights.map((v, i) => (
                            <li key={i} className="rounded-lg bg-muted/20 px-2.5 py-1 text-xs">
                              <s>{v.original}</s> → <strong>{v.suggestion}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {attempt.feedback?.naturalRewrite ? (
                        <p className="text-sm italic leading-relaxed text-secondary-text">
                          {attempt.feedback.naturalRewrite}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => void repractice(reviewing!)}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t("v1.session.summary.repractice")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setReviewing(null);
                  setReviewData(null);
                }}
              >
                {t("common.close")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-tertiary-text">{t("common.error")}</p>
        )}
      </Modal>
    </section>
  );
}
