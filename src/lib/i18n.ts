"use client";

import { useSettingsStore } from "@/store/settingsStore";
import { t, type Locale } from "@/lib/dict";

// 客户端翻译 hook：读 zustand persist 的 locale
export function useT() {
  const locale = useSettingsStore((s) => s.locale);
  return {
    locale,
    setLocale: (l: Locale) => useSettingsStore.getState().setLocale(l),
    t: (key: string) => t(locale, key),
  };
}

export { t };
