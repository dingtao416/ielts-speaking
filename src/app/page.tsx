"use client";

import Link from "next/link";
import { Mic, Sparkles, Target, TrendingUp } from "lucide-react";

import { useT } from "@/lib/i18n";
import { buttonClass } from "@/components/ui/button";

export default function HomePage() {
  const { t } = useT();

  const steps = [
    {
      icon: Mic,
      title: t("home.step1.title"),
      desc: t("home.step1.desc"),
    },
    {
      icon: Sparkles,
      title: t("home.step2.title"),
      desc: t("home.step2.desc"),
    },
    {
      icon: Target,
      title: t("home.step3.title"),
      desc: t("home.step3.desc"),
    },
  ];

  return (
    <div className="flex flex-col gap-16">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 pt-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground text-background">
          <Mic className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          {t("home.hero.title")}
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-secondary-text">
          {t("home.hero.subtitle")}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/bank"
            className={buttonClass("primary", "lg")}
          >
            <Mic className="h-5 w-5" aria-hidden="true" />
            {t("home.cta.start")}
          </Link>
          <Link
            href="/progress"
            className={buttonClass("secondary", "lg")}
          >
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
            {t("home.cta.progress")}
          </Link>
        </div>
      </section>

      {/* Three-step explainer */}
      <section className="grid gap-4 sm:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.title}
            className="flex flex-col gap-3 rounded-2xl border border-border p-6 transition-shadow hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <step.icon className="h-5 w-5 text-foreground" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold">{step.title}</h3>
            <p className="text-sm leading-relaxed text-secondary-text">
              {step.desc}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
