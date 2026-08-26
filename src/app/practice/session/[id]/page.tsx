import type { Metadata } from "next";

import { hasAuthenticatedWebSession } from "@/application/authentication";
import { headers } from "next/headers";
import { SessionBoundary } from "@/components/session/session-boundary";
import { PracticeRunner } from "@/components/practice/practice-runner";

export const metadata: Metadata = {
  title: "练习 | 雅思口语训练",
};

export default async function PracticeSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const serverAuthenticated = await hasAuthenticatedWebSession(await headers());

  return (
    <SessionBoundary serverAuthenticated={serverAuthenticated}>
      <PracticeRunner sessionId={id} />
    </SessionBoundary>
  );
}
