import type { Metadata } from "next";
import { headers } from "next/headers";

import { hasAuthenticatedWebSession } from "@/application/authentication";
import { SessionBoundary } from "@/components/session/session-boundary";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const metadata: Metadata = {
  title: "开始诊断 | 雅思口语训练",
};

export default async function OnboardingPage() {
  const serverAuthenticated = await hasAuthenticatedWebSession(await headers());

  return (
    <SessionBoundary serverAuthenticated={serverAuthenticated}>
      <OnboardingFlow />
    </SessionBoundary>
  );
}
