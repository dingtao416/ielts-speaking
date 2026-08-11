import type { Metadata } from "next";

import { hasAuthenticatedWebSession } from "@/application/authentication";
import { headers } from "next/headers";
import { SessionBoundary } from "@/components/session/session-boundary";
import { AiCoachSession } from "@/components/practice/ai-coach-session";

export const metadata: Metadata = {
  title: "口语练习 | 雅思口语训练",
};

export default async function PracticeTopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  const serverAuthenticated = await hasAuthenticatedWebSession(await headers());

  return (
    <SessionBoundary serverAuthenticated={serverAuthenticated}>
      <AiCoachSession topic={decodeURIComponent(topic)} />
    </SessionBoundary>
  );
}
