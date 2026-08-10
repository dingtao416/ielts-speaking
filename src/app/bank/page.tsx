import type { Metadata } from "next";

import { getBankIndex } from "@/lib/bank";
import { BankBrowser } from "@/components/bank/bank-browser";
import { BankPageHeader } from "@/components/bank/bank-page-header";

export const metadata: Metadata = {
  title: "题库 | 雅思口语训练",
  description: "雅思口语历年真题与预测题题库",
};

export default function BankPage() {
  const index = getBankIndex();
  const realYears = index.real.years;
  const predictedYears = index.predicted.years;

  return (
    <div className="flex flex-col gap-6">
      <BankPageHeader />

      <BankBrowser realYears={realYears} predictedYears={predictedYears} />
    </div>
  );
}
