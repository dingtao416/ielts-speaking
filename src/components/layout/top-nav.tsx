"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpenText, LogOut, Mic, Settings2 } from "lucide-react";

import { authClient } from "@/auth-client";
import { LocaleToggle } from "@/components/layout/locale-toggle";
import { useT } from "@/lib/i18n";

export function TopNav() {
  const { t } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  const navItems = [
    { href: "/bank", label: t("nav.bank"), icon: BookOpenText },
    { href: "/library", label: t("nav.library"), icon: Settings2 },
  ];

  function linkFor(href: string) {
    return `${href}${pathname.startsWith(href) ? " text-foreground font-semibold" : " text-secondary-text"}`;
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-foreground" aria-hidden="true" />
            <span className="text-lg font-bold tracking-tight">
              {t("brand.name")}
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${linkFor(item.href)}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <LocaleToggle />
          {isPending ? null : user ? (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium leading-tight">
                  {user.name || user.email}
                </div>
                <div className="text-xs text-tertiary-text">
                  {user.email}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border text-secondary-text transition-colors hover:bg-muted hover:text-foreground"
                title={t("nav.signOut")}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              {t("nav.signIn")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
