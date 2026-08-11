"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  BookOpen,
  LineChart,
  Target,
  X,
} from "lucide-react";

import type { AbilityProfile } from "@/persistence/schema";
import { DIMENSION_LABELS, DIMENSION_LABELS_EN } from "@/lib/profile";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { BandTrendChart, type TrendPoint } from "@/components/progress/band-trend-chart";

interface ProfilePayload {
  targetBand: number | null;
  profile: AbilityProfile | null;
  onboarded: boolean;
  onboardedAt?: string | null;
}

interface SessionRow {
  id: string;
  questionId?: string | null;
  topic?: string | null;
  part?: number | null;
  mode: "train" | "recite";
  startTime: string;
  durationSec: number;
  fullText: string;
  bands?: {
    fluency?: number;
    lexical?: number;
    grammar?: number;
    pronunciation?: number;
    overall?: number;
  } | null;
  bandEstimate?: number | null;
  reportMarkdown?: string | null;
}

function formatDuration(sec: number, t: (k: string, vars?: Record<string, string>) => string) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}${t("common.seconds")}`;
  return `${m}${t("common.minutes")} ${s}${t("common.seconds")}`;
}

function formatDate(iso: string, locale: string) {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", opts);
}

export function ProgressPanel() {
  const { t, locale } = useT();
  const [profileData, setProfileData] = useState<ProfilePayload | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingReport, setViewingReport] = useState<SessionRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, sessionsRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/sessions"),
      ]);
      if (!profileRes.ok || !sessionsRes.ok) throw new Error();
      const profileJson = (await profileRes.json()) as ProfilePayload;
      const sessionsJson = await sessionsRes.json();
      setProfileData(profileJson);
      setSessions(sessionsJson.sessions ?? []);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // 趋势点：取有 bands.overall 或 bandEstimate 的训练记录（新的在前，倒序展示）
  const trendPoints = useMemo<TrendPoint[]>(() => {
    const rows = sessions ?? [];
    const assessed = rows
      .filter((s) => {
        const band = s.bands?.overall ?? s.bandEstimate;
        return typeof band === "number";
      })
      .map((s) => ({
        y: Number(s.bands?.overall ?? s.bandEstimate),
        x: new Date(s.startTime).getTime(),
        label: formatDate(s.startTime, locale),
      }))
      .reverse(); // 旧的在前，时间从左到右
    return assessed;
  }, [sessions, locale]);

  const profile = profileData?.profile ?? null;
  const dims = profile?.dimensions ?? null;
  const dimLabels = locale === "zh" ? DIMENSION_LABELS : DIMENSION_LABELS_EN;

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-secondary-text">
        {t("common.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-secondary-text">{error}</p>
        <Button variant="secondary" onClick={() => void load()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  const hasAssessed = trendPoints.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{t("progress.title")}</h1>
        <p className="text-sm text-secondary-text">{t("progress.subtitle")}</p>
      </div>

      {/* 顶部：能力档案摘要 */}
      <section className="rounded-2xl border border-border p-6">
        {profile ? (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Activity className="h-4 w-4" aria-hidden="true" />
                {t("progress.profile")}
              </h2>
              {profile.updatedAt ? (
                <span className="text-xs text-tertiary-text">
                  {t("progress.updatedAt")} {formatDate(profile.updatedAt, locale)}
                </span>
              ) : null}
            </div>

            {/* 当前 vs 目标 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border p-5 text-center">
                <div className="text-xs font-medium text-tertiary-text">
                  {t("progress.overall")}
                </div>
                <div className="mt-1 text-3xl font-bold tabular-nums">
                  {profile.overallBand.toFixed(1)}
                </div>
              </div>
              <div className="rounded-2xl border border-foreground p-5 text-center">
                <div className="text-xs font-medium text-tertiary-text">
                  {t("progress.target")}
                </div>
                <div className="mt-1 text-3xl font-bold tabular-nums">
                  {profile.targetBand.toFixed(1)}
                </div>
              </div>
            </div>

            {/* 四维 */}
            {dims ? (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-secondary-text">
                  {t("progress.dimensions")}
                </h3>
                {(
                  [
                    ["fluency", dims.fluency],
                    ["lexical", dims.lexical],
                    ["grammar", dims.grammar],
                    ["pronunciation", dims.pronunciation],
                  ] as const
                ).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-secondary-text">
                      {dimLabels[key]}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-foreground"
                          style={{ width: `${(val / 9) * 100}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm font-bold tabular-nums">
                        {val.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* 主要问题 */}
            {profile.mainIssues?.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-secondary-text">
                  {t("progress.mainIssues")}
                </h3>
                <ul className="list-inside list-disc space-y-1 text-sm text-secondary-text">
                  {profile.mainIssues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* 阶段路径 */}
            {profile.stagePath?.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-secondary-text">
                  {t("progress.stagePath")} → {profile.targetBand.toFixed(1)}
                </h3>
                <ol className="list-inside list-decimal space-y-1 text-sm text-secondary-text">
                  {profile.stagePath.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Target className="h-8 w-8 text-tertiary-text" aria-hidden="true" />
            <p className="max-w-md text-sm text-secondary-text">
              {t("progress.profile.empty")}
            </p>
            <Link
              href="/onboarding"
              className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              {t("progress.profile.goDiagnostic")}
            </Link>
          </div>
        )}
      </section>

      {/* 趋势图 */}
      <section className="rounded-2xl border border-border p-6">
        <div className="mb-4 flex items-center gap-2">
          <LineChart className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-base font-semibold">{t("progress.trend")}</h2>
          {hasAssessed ? (
            <span className="text-xs text-tertiary-text">
              {t("progress.history.count").replace("{count}", String(trendPoints.length))}
            </span>
          ) : null}
        </div>
        {hasAssessed ? (
          <BandTrendChart points={trendPoints} />
        ) : (
          <p className="py-6 text-center text-sm text-tertiary-text">
            {t("progress.trend.empty")}
          </p>
        )}
      </section>

      {/* 历史列表 */}
      <section className="rounded-2xl border border-border p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            {t("progress.history")}
          </h2>
          {sessions && sessions.length > 0 ? (
            <span className="text-xs text-tertiary-text">
              {t("progress.history.count").replace("{count}", String(sessions.length))}
            </span>
          ) : null}
        </div>

        {!sessions || sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <BookOpen className="h-8 w-8 text-tertiary-text" aria-hidden="true" />
            <p className="max-w-md text-sm text-secondary-text">
              {t("progress.history.empty")}
            </p>
            <Link
              href="/bank"
              className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              {t("progress.history.goPractice")}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => {
              const band = s.bands?.overall ?? s.bandEstimate;
              const label =
                s.mode === "train" ? t("progress.mode.train") : t("progress.mode.recite");
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border p-3.5 transition-colors hover:bg-muted/40"
                >
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                    {label}
                    {s.part ? ` · Part ${s.part}` : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {s.topic ? `${s.topic} — ` : ""}
                    {s.fullText ? `${s.fullText.slice(0, 60)}${s.fullText.length > 60 ? "…" : ""}` : t("progress.noBand")}
                  </span>
                  <span className="text-xs text-tertiary-text">
                    {formatDuration(s.durationSec, t)}
                  </span>
                  <span className="text-xs text-tertiary-text">
                    {formatDate(s.startTime, locale)}
                  </span>
                  <span className="w-16 text-right text-sm font-bold tabular-nums">
                    {typeof band === "number" ? band.toFixed(1) : <span className="font-normal text-tertiary-text">{t("progress.noBand")}</span>}
                  </span>
                  {s.reportMarkdown ? (
                    <button
                      type="button"
                      onClick={() => setViewingReport(s)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-secondary-text transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98]"
                    >
                      {t("progress.session.report")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 报告弹窗 */}
      {viewingReport ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setViewingReport(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t("progress.session.report")}</h3>
              <button
                type="button"
                onClick={() => setViewingReport(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-secondary-text transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98]"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {viewingReport.reportMarkdown}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
