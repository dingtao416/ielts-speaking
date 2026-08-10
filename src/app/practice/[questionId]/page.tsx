import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getQuestionById } from "@/lib/bank";
import { hasAuthenticatedWebSession } from "@/application/authentication";
import { headers } from "next/headers";
import { SessionBoundary } from "@/components/session/session-boundary";
import { PracticeSession } from "@/components/practice/practice-session";

export const metadata: Metadata = {
  title: "口语练习 | 雅思口语训练",
};

export default async function PracticePage({
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
      <PracticeSession question={question} />
    </SessionBoundary>
  );
}
