import type { Metadata } from "next";

import { hasAuthenticatedWebSession } from "@/application/authentication";
import { headers } from "next/headers";
import { SessionBoundary } from "@/components/session/session-boundary";
import { PracticeHome } from "@/components/practice/practice-home";

export const metadata: Metadata = {
  title: "练习 | 雅思口语训练",
};

export default async function PracticePage() {
  const serverAuthenticated = await hasAuthenticatedWebSession(await headers());

  return (
    <SessionBoundary serverAuthenticated={serverAuthenticated}>
      <PracticeHome />
    </SessionBoundary>
  );
}
