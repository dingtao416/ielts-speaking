import type { Metadata } from "next";

import { hasAuthenticatedWebSession } from "@/application/authentication";
import { headers } from "next/headers";
import { SessionBoundary } from "@/components/session/session-boundary";
import { FrameworkLibrary } from "@/components/library/framework-library";

export const metadata: Metadata = {
  title: "素材本 | 雅思口语训练",
};

export default async function LibraryPage() {
  const serverAuthenticated = await hasAuthenticatedWebSession(await headers());

  return (
    <SessionBoundary serverAuthenticated={serverAuthenticated}>
      <FrameworkLibrary />
    </SessionBoundary>
  );
}
