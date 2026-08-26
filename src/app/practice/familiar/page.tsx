import type { Metadata } from "next";

import { hasAuthenticatedWebSession } from "@/application/authentication";
import { headers } from "next/headers";
import { SessionBoundary } from "@/components/session/session-boundary";
import { FamiliarPicker } from "@/components/practice/familiar-picker";
import { getFamiliarCategories, getFamiliarSetVersion } from "@/lib/bank";

export const metadata: Metadata = {
  title: "熟悉话题 | 雅思口语训练",
};

export default async function FamiliarPage() {
  const serverAuthenticated = await hasAuthenticatedWebSession(await headers());
  const categories = getFamiliarCategories();
  const version = getFamiliarSetVersion();

  return (
    <SessionBoundary serverAuthenticated={serverAuthenticated}>
      <FamiliarPicker categories={categories} version={version} />
    </SessionBoundary>
  );
}
