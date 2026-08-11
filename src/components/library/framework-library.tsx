"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Download, Pencil, Trash2 } from "lucide-react";

import type { Framework } from "@/lib/frameworks";
import { frameworkToMarkdown } from "@/lib/frameworks";
import { useT } from "@/lib/i18n";
import { Button, buttonClass } from "@/components/ui/button";

export function FrameworkLibrary() {
  const { t } = useT();
  const [frameworks, setFrameworks] = useState<Framework[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Framework | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/frameworks");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFrameworks(data.frameworks ?? []);
    } catch {
      setError("Failed to load frameworks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm(t("library.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/frameworks/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFrameworks((prev) => prev?.filter((f) => f.id !== id) ?? null);
      }
    } catch {
      /* 静默 */
    }
  }

  function handleExport(f: Framework) {
    const blob = new Blob([frameworkToMarkdown(f)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${f.topic}-part${f.part}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    try {
      const res = await fetch("/api/frameworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (res.ok) {
        const data = await res.json();
        setFrameworks((prev) =>
          prev?.map((f) => (f.id === editing.id ? data.framework : f)) ?? null,
        );
        setEditing(null);
      }
    } catch {
      /* 静默 */
    }
  }

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
        <Button
          variant="secondary"
          onClick={() => void load()}
        >
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (!frameworks || frameworks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <BookOpen className="h-10 w-10 text-tertiary-text" aria-hidden="true" />
        <p className="text-secondary-text">{t("library.empty")}</p>
        <Link
          href="/bank"
          className={buttonClass("primary", "md")}
        >
          {t("home.cta.browse")}
        </Link>
      </div>
    );
  }

  // 按话题分组
  const grouped = frameworks.reduce<Record<string, Framework[]>>((acc, f) => {
    (acc[f.topic] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("library.title")}
        </h1>
        <p className="text-sm text-secondary-text">{t("library.subtitle")}</p>
      </div>

      {Object.entries(grouped).map(([topic, list]) => (
        <div key={topic} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{topic}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((f) =>
              editing?.id === f.id ? (
                <div
                  key={f.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border p-5"
                >
                  <textarea
                    value={editing.intro ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, intro: e.target.value })
                    }
                    placeholder={t("library.intro")}
                    className="rounded-lg border border-border bg-background p-2 text-sm"
                  />
                  <div>
                    <div className="mb-1 text-xs font-semibold text-secondary-text">
                      {t("library.structure")}
                    </div>
                    <textarea
                      value={editing.structure.join("\n")}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          structure: e.target.value
                            .split("\n")
                            .filter(Boolean),
                        })
                      }
                      className="h-24 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold text-secondary-text">
                      {t("library.keyPoints")}
                    </div>
                    <textarea
                      value={editing.keyPoints.join("\n")}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          keyPoints: e.target.value.split("\n").filter(Boolean),
                        })
                      }
                      className="h-24 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold text-secondary-text">
                      {t("library.expressions")}
                    </div>
                    <textarea
                      value={editing.expressions
                        .map((e) => `${e.phrase} | ${e.meaning}`)
                        .join("\n")}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          expressions: e.target.value
                            .split("\n")
                            .filter(Boolean)
                            .map((line) => {
                              const [phrase, meaning] = line.split("|");
                              return {
                                phrase: phrase?.trim() ?? "",
                                meaning: meaning?.trim() ?? "",
                              };
                            }),
                        })
                      }
                      className="h-24 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveEdit}
                      size="sm"
                    >
                      {t("library.save")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setEditing(null)}
                      size="sm"
                    >
                      {t("library.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={f.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border p-5"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-secondary-text">
                      Part {f.part}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(f)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-secondary-text transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-[0.95]"
                        title={t("library.edit")}
                        aria-label={t("library.edit")}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(f)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-secondary-text transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-[0.95]"
                        title={t("library.export")}
                        aria-label={t("library.export")}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(f.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-secondary-text transition-all duration-150 hover:bg-muted hover:text-[var(--danger-color)] active:scale-[0.95]"
                        title={t("library.delete")}
                        aria-label={t("library.delete")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {f.intro ? (
                    <p className="text-sm text-secondary-text">{f.intro}</p>
                  ) : null}
                  {f.structure.length > 0 ? (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-secondary-text">
                        {t("library.structure")}
                      </div>
                      <ol className="list-inside list-decimal space-y-0.5 text-sm">
                        {f.structure.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {f.keyPoints.length > 0 ? (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-secondary-text">
                        {t("library.keyPoints")}
                      </div>
                      <ul className="list-inside list-disc space-y-0.5 text-sm text-secondary-text">
                        {f.keyPoints.map((k, i) => (
                          <li key={i}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {f.expressions.length > 0 ? (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-secondary-text">
                        {t("library.expressions")}
                      </div>
                      <ul className="space-y-0.5 text-sm">
                        {f.expressions.map((e, i) => (
                          <li key={i}>
                            <span className="font-medium">{e.phrase}</span>
                            <span className="text-secondary-text">
                              {" "}
                              — {e.meaning}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {f.stories && f.stories.length > 0 ? (
                    <div>
                      <div className="mb-1 text-xs font-semibold text-secondary-text">
                        {t("library.stories")}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {f.stories.map((s, i) => (
                          <div
                            key={i}
                            className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs"
                          >
                            <div className="font-medium">{s.title}</div>
                            {s.setting ? (
                              <div className="text-secondary-text">{s.setting}</div>
                            ) : null}
                            {s.applyToTopics?.length ? (
                              <div className="mt-0.5 text-tertiary-text">
                                {t("library.storiesApply", { topics: s.applyToTopics.join(" / ") })}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
