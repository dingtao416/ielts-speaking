"use client";

import { useT } from "@/lib/i18n";

export function BankPageHeader() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight">{t("bank.page.title")}</h1>
      <p className="text-sm text-secondary-text">{t("bank.page.subtitle")}</p>
    </div>
  );
}
