"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookMarked,
  BookOpenText,
  LogOut,
  Menu,
  Mic,
  Settings2,
  TrendingUp,
  X,
} from "lucide-react";

import { authClient } from "@/auth-client";
import { LocaleToggle } from "@/components/layout/locale-toggle";
import { useT } from "@/lib/i18n";
import { buttonClass } from "@/components/ui/button";

export function TopNav() {
  const { t } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { href: "/bank", label: t("nav.bank"), icon: BookOpenText },
    { href: "/library", label: t("nav.library"), icon: BookMarked },
    { href: "/progress", label: t("nav.progress"), icon: TrendingUp },
    { href: "/settings", label: t("nav.settings"), icon: Settings2 },
  ];

  function isActive(href: string) {
    return pathname.startsWith(href);
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-8">
          <Link
            href="/"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-lg transition-colors hover:opacity-80 focus-visible:outline-2"
          >
            <Mic className="h-5 w-5 text-foreground" aria-hidden="true" />
            <span className="text-lg font-bold tracking-tight">
              {t("brand.name")}
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label={t("nav.label")}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 hover:bg-muted active:scale-[0.98] ${
                  isActive(item.href)
                    ? "text-foreground font-semibold"
                    : "text-secondary-text"
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleToggle />
          {isPending ? null : user ? (
            <div className="flex items-center gap-2">
              <div className="hidden text-right md:block">
                <div className="text-sm font-medium leading-tight">
                  {user.name || user.email}
                </div>
                <div className="text-xs text-tertiary-text">{user.email}</div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-secondary-text transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98]"
                title={t("nav.signOut")}
                aria-label={t("nav.signOut")}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={buttonClass("primary", "md")}
            >
              {t("nav.signIn")}
            </Link>
          )}
          {/* 移动端菜单开关 */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-secondary-text transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-[0.98] sm:hidden"
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* 移动端导航（下拉） */}
      {menuOpen ? (
        <nav
          className="border-t border-border bg-background px-4 py-2 sm:hidden"
          aria-label={t("nav.label")}
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive(item.href)
                  ? "bg-muted font-semibold text-foreground"
                  : "text-secondary-text hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
