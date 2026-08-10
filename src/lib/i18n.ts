"use client";

import { useCallback } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import { t, type Locale } from "@/lib/dict";

// 客户端翻译 hook：读 zustand persist 的 locale
export function useT() {
  const locale = useSettingsStore((s) => s.locale);
  return {
    locale,
    setLocale: (l: Locale) => useSettingsStore.getState().setLocale(l),
    t: useCallback(
      (key: string, vars?: Record<string, string | number>) =>
        t(locale, key, vars),
      [locale],
    ),
  };
}

export { t };
