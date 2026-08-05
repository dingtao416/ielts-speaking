"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { authClient } from "@/auth-client";
import { useT } from "@/lib/i18n";

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { t } = useT();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={`inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted ${className}`}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {t("nav.signOut")}
    </button>
  );
}
