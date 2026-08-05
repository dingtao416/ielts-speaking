"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Locale } from "@/lib/dict";

type SettingsState = {
  locale: Locale;
  asrLang: string;
  setLocale: (locale: Locale) => void;
  setAsrLang: (lang: string) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: "zh",
      asrLang: "zh-CN",
      setLocale: (locale) => set({ locale }),
      setAsrLang: (asrLang) => set({ asrLang }),
    }),
    {
      name: "ielts.settings",
    },
  ),
);
