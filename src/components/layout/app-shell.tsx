"use client";

import { useEffect, type ReactNode } from "react";

import { TopNav } from "@/components/layout/top-nav";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settingsStore";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  const locale = useSettingsStore((s) => s.locale);

  // 让 <html lang> 与当前界面语言一致（屏幕阅读器 / 浏览器语言）
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  return (
    <>
      <TopNav />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </div>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-sm text-tertiary-text sm:px-6">
          <span>{t("brand.name")}</span>
          <span>{t("appShell.tagline")}</span>
        </div>
      </footer>
    </>
  );
}
