import type { Metadata } from "next";

import { hasAuthenticatedWebSession } from "@/application/authentication";
import { headers } from "next/headers";
import { SessionBoundary } from "@/components/session/session-boundary";
import { ProgressPanel } from "@/components/progress/progress-panel";

export const metadata: Metadata = {
  title: "成长档案 | 雅思口语训练",
};

export default async function ProgressPage() {
  const serverAuthenticated = await hasAuthenticatedWebSession(await headers());

  return (
    <SessionBoundary serverAuthenticated={serverAuthenticated}>
      <ProgressPanel />
    </SessionBoundary>
  );
}
