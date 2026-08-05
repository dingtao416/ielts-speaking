import type { Metadata } from "next";

import { getBankIndex } from "@/lib/bank";
import { BankBrowser } from "@/components/bank/bank-browser";

export const metadata: Metadata = {
  title: "题库 | 雅思口语训练",
  description: "雅思口语历年真题与预测题题库",
};

export default function BankPage() {
  const index = getBankIndex();
  const realYears = index.real.years;
  const predictedYears = index.predicted.years;
  const realTopics = index.real.topics;
  const predictedTopics = index.predicted.topics;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">雅思口语题库</h1>
        <p className="text-sm text-secondary-text">
          历年真题训练 · 预测题背诵
        </p>
      </div>

      <BankBrowser
        realYears={realYears}
        predictedYears={predictedYears}
        realTopics={realTopics}
        predictedTopics={predictedTopics}
      />
    </div>
  );
}
