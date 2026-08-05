import type { TextStats } from "@/lib/lexicon";

export interface SessionRecordPayload {
  id: string;
  userId: string;
  questionId?: string | null;
  topic?: string | null;
  part?: number | null;
  mode: "train" | "recite";
  startTime: string; // ISO
  durationSec: number;
  fullText: string;
  stats: TextStats;
  bandEstimate?: number | null;
  reportMarkdown?: string | null;
  frameworkId?: string | null;
}

// 前端保存练习记录时发送的 payload（不含 userId/id，服务端填充）
export interface SaveSessionInput {
  questionId?: string;
  topic?: string;
  part?: number;
  mode: "train" | "recite";
  durationSec: number;
  fullText: string;
  stats: TextStats;
  bandEstimate?: number;
  reportMarkdown?: string;
  frameworkId?: string;
}
