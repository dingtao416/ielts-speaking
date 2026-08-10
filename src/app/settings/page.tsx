import type { Metadata } from "next";

import { SettingsPanel } from "@/components/settings/settings-panel";

export const metadata: Metadata = {
  title: "设置 | 雅思口语训练",
};

export default function SettingsPage() {
  return <SettingsPanel />;
}
