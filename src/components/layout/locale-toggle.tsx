"use client";

import { Languages } from "lucide-react";

import { useT } from "@/lib/i18n";
import { LOCALES, type Locale } from "@/lib/dict";

export function LocaleToggle() {
  const { locale, setLocale } = useT();

  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-background p-0.5">
      <Languages className="h-4 w-4 text-secondary-text px-0.5" aria-hidden="true" />
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
            locale === l
              ? "bg-foreground text-background"
              : "text-secondary-text hover:text-foreground"
          }`}
        >
          {l === "zh" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}
