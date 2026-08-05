import type { ReactNode } from "react";

import { TopNav } from "@/components/layout/top-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TopNav />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </div>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-sm text-tertiary-text sm:px-6">
          <span>IELTS Speaking Trainer</span>
          <span>基于历年真题 · 提炼框架 · 预测背诵</span>
        </div>
      </footer>
    </>
  );
}
