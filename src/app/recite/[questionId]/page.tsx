import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { getQuestionById } from "@/lib/bank";
import { hasAuthenticatedWebSession } from "@/application/authentication";
import { SessionBoundary } from "@/components/session/session-boundary";
import { ReciteSession } from "@/components/recite/recite-session";

export const metadata: Metadata = {
  title: "背诵实践 | 雅思口语训练",
};

export default async function RecitePage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}) {
  const { questionId } = await params;
  const question = getQuestionById(questionId);
  if (!question) {
    notFound();
  }

  const serverAuthenticated = await hasAuthenticatedWebSession(await headers());

  return (
    <SessionBoundary serverAuthenticated={serverAuthenticated}>
      <ReciteSession question={question} />
    </SessionBoundary>
  );
}
