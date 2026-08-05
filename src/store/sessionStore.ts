"use client";

import { create } from "zustand";

import type { TextStats } from "@/lib/lexicon";

export interface CoachTip {
  id: string;
  text: string;
  category: "good" | "filler" | "hedge" | "vague" | "ai";
}

interface PracticeState {
  // 字幕
  fullText: string;
  interimText: string;
  sentences: string[];
  // 统计
  stats: TextStats;
  // 教练反馈
  coachTips: CoachTip[];
  // 报告
  reportMarkdown: string | null;
  reportStatus: "idle" | "generating" | "done" | "error";
  // 框架
  framework: unknown | null;
  frameworkStatus: "idle" | "extracting" | "done" | "error";

  appendFinal: (text: string) => void;
  setInterim: (text: string) => void;
  updateStats: (stats: TextStats) => void;
  addCoachTip: (tip: CoachTip) => void;
  clearCoachTips: () => void;
  setReport: (markdown: string | null) => void;
  setReportStatus: (status: PracticeState["reportStatus"]) => void;
  setFramework: (framework: unknown | null) => void;
  setFrameworkStatus: (status: PracticeState["frameworkStatus"]) => void;
  reset: () => void;
}

const emptyStats: TextStats = {
  totalWords: 0,
  fillers: 0,
  hedges: 0,
  vagueWords: 0,
  chinglish: 0,
  density: 100,
  duration: 0,
};

export const usePracticeStore = create<PracticeState>((set) => ({
  fullText: "",
  interimText: "",
  sentences: [],
  stats: { ...emptyStats },
  coachTips: [],
  reportMarkdown: null,
  reportStatus: "idle",
  framework: null,
  frameworkStatus: "idle",

  appendFinal: (text) =>
    set((s) => ({
      fullText: s.fullText ? `${s.fullText} ${text}` : text,
      sentences: [...s.sentences, text],
    })),
  setInterim: (text) => set({ interimText: text }),
  updateStats: (stats) => set({ stats }),
  addCoachTip: (tip) =>
    set((s) => ({
      coachTips: [tip, ...s.coachTips].slice(0, 20),
    })),
  clearCoachTips: () => set({ coachTips: [] }),
  setReport: (markdown) => set({ reportMarkdown: markdown }),
  setReportStatus: (status) => set({ reportStatus: status }),
  setFramework: (framework) => set({ framework }),
  setFrameworkStatus: (status) => set({ frameworkStatus: status }),
  reset: () =>
    set({
      fullText: "",
      interimText: "",
      sentences: [],
      stats: { ...emptyStats },
      coachTips: [],
      reportMarkdown: null,
      reportStatus: "idle",
      framework: null,
      frameworkStatus: "idle",
    }),
}));
