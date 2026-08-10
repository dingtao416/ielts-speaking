"use client";

import { useT } from "@/lib/i18n";

export function AuthFooterNote() {
  const { t } = useT();
  return (
    <p className="mt-8 text-center text-xs text-tertiary-text">
      {t("auth.terms")}
    </p>
  );
}
