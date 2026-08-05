"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { authClient } from "@/auth-client";

export function SessionBoundary({
  children,
  serverAuthenticated,
}: {
  children: ReactNode;
  serverAuthenticated: boolean;
}) {
  const clientSession = authClient.useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientAuthenticated = Boolean(clientSession.data?.user);
  const authenticated = serverAuthenticated || clientAuthenticated;
  const pending = !serverAuthenticated && clientSession.isPending;
  const query = searchParams.toString();

  useEffect(() => {
    if (pending || authenticated) {
      return;
    }

    const returnTo = `${pathname}${query ? `?${query}` : ""}`;
    router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [authenticated, pathname, pending, query, router]);

  if (authenticated) {
    return children;
  }

  return (
    <main className="flex min-h-[60vh] items-center justify-center" id="main-content">
      <div className="flex flex-col items-center gap-4 text-secondary-text">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
        <p>{pending ? "Verifying secure session…" : "Returning to sign in…"}</p>
      </div>
    </main>
  );
}
