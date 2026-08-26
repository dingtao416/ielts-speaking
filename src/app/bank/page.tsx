import type { Metadata } from "next";

import { BankBrowser } from "@/components/bank/bank-browser";
import { BankPageHeader } from "@/components/bank/bank-page-header";
import {
  getStandardTopicSetsByScope,
  getStandardTopicYears,
  getStandardBankVersion,
} from "@/lib/bank";

export const metadata: Metadata = {
  title: "题库 | 雅思口语训练",
  description: "标准话题：按年份/最新话题、Part 与话题选择已发布标准题组练习",
};

export default function BankPage() {
  const years = getStandardTopicYears();
  const setsByYear = Object.fromEntries(
    years.map((y) => [y, getStandardTopicSetsByScope("year", y)]),
  );
  const latestSets = getStandardTopicSetsByScope("latest");
  const version = getStandardBankVersion();

  return (
    <div className="flex flex-col gap-6">
      <BankPageHeader />

      <BankBrowser
        years={years}
        setsByYear={setsByYear}
        latestSets={latestSets}
        version={version}
      />
    </div>
  );
}
