import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInScreen } from "@/components/auth/sign-in-screen";
import { AuthFooterNote } from "@/components/auth/auth-footer-note";

export const metadata: Metadata = {
  title: "登录 | 雅思口语训练",
  description: "登录雅思口语训练系统",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string; returnTo?: string }>;
}) {
  const { auth, returnTo } = await searchParams;
  const view = auth === "signup" ? "sign-up" : "sign-in";

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
      <Suspense fallback={null}>
        <SignInScreen
          initialView={view}
          returnTo={safeReturnTo(returnTo)}
        />
      </Suspense>
      <AuthFooterNote />
    </div>
  );
}

function safeReturnTo(value: string | undefined) {
  if (!value || value.startsWith("//")) {
    return "/bank";
  }
  if (value.startsWith("/bank") || value.startsWith("/practice") || value.startsWith("/recite") || value.startsWith("/library") || value.startsWith("/onboarding")) {
    return value;
  }
  return "/bank";
}
