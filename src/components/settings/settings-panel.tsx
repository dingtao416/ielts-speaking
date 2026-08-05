"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settingsStore";
import { authClient } from "@/auth-client";

export function SettingsPanel() {
  const { t, locale, setLocale } = useT();
  const { asrLang, setAsrLang } = useSettingsStore();
  const [llmStatus, setLlmStatus] = useState<{
    provider: string;
    model: string;
    configured: boolean;
  } | null>(null);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    fetch("/api/llm/health")
      .then((r) => r.json())
      .then(setLlmStatus)
      .catch(() => setLlmStatus(null));
  }, []);

  const section = "rounded-2xl border border-border p-6";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("settings.title")}
        </h1>
      </div>

      {/* 界面语言 */}
      <div className={section}>
        <h2 className="mb-4 text-base font-semibold">{t("settings.language")}</h2>
        <div className="flex gap-2">
          {(["zh", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                locale === l
                  ? "bg-foreground text-background"
                  : "border border-border text-secondary-text hover:text-foreground"
              }`}
            >
              {l === "zh" ? t("settings.language.zh") : t("settings.language.en")}
            </button>
          ))}
        </div>
      </div>

      {/* 语音识别语言 */}
      <div className={section}>
        <h2 className="mb-4 text-base font-semibold">{t("settings.asr")}</h2>
        <div className="flex gap-2">
          {[
            { value: "en-US", label: "English (en-US)" },
            { value: "zh-CN", label: "中文 (zh-CN)" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAsrLang(opt.value)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                asrLang === opt.value
                  ? "bg-foreground text-background"
                  : "border border-border text-secondary-text hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI 服务 */}
      <div className={section}>
        <h2 className="mb-4 text-base font-semibold">{t("settings.llm")}</h2>
        {llmStatus ? (
          <div className="flex items-center gap-2 text-sm">
            {llmStatus.configured ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4 text-[var(--filler-color)]" aria-hidden="true" />
            )}
            <span className="text-secondary-text">
              {t("settings.llm.provider")}: {llmStatus.provider} ·{" "}
              {llmStatus.model || t("settings.llm.notConfigured")} —{" "}
              {llmStatus.configured
                ? t("settings.llm.configured")
                : t("settings.llm.notConfigured")}
            </span>
          </div>
        ) : (
          <p className="text-sm text-tertiary-text">{t("common.loading")}</p>
        )}
      </div>

      {/* 账户 */}
      <div className={section}>
        <h2 className="mb-4 text-base font-semibold">{t("settings.account")}</h2>
        {session?.user ? (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-16 text-secondary-text">{t("settings.account.email")}</span>
              <span>{session.user.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-secondary-text">{t("settings.account.username")}</span>
              <span>{session.user.username || session.user.name}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-secondary-text">
            {t("nav.signIn")}…
          </p>
        )}
      </div>
    </div>
  );
}
