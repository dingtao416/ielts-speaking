import type { AbilityProfile, BandScores } from "@/persistence/schema";

// 能力档案工具库

export const BAND_OPTIONS = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0] as const;

/** 四维 key 的中文/英文标签 */
export const DIMENSION_KEYS = [
  "fluency",
  "lexical",
  "grammar",
  "pronunciation",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  fluency: "流利度与连贯性",
  lexical: "词汇资源",
  grammar: "语法范围与准确性",
  pronunciation: "发音与可理解度",
};

export const DIMENSION_LABELS_EN: Record<DimensionKey, string> = {
  fluency: "Fluency & Coherence",
  lexical: "Lexical Resource",
  grammar: "Grammatical Range & Accuracy",
  pronunciation: "Pronunciation & Delivery",
};

/** 默认档案（诊断前） */
export function emptyProfile(targetBand = 6.5): AbilityProfile {
  return {
    overallBand: 5.0,
    targetBand,
    dimensions: { fluency: 5.0, lexical: 5.0, grammar: 5.0, pronunciation: 5.0, overall: 5.0 },
    mainIssues: [],
    stagePath: [],
    updatedAt: new Date().toISOString(),
  };
}

/** 四维 band 取平均得到 overall（0.5 步进） */
export function averageOverall(bands: BandScores): number {
  const avg =
    (bands.fluency + bands.lexical + bands.grammar + bands.pronunciation) / 4;
  return roundHalf(avg);
}

/** 四舍五入到 0.5 步进 */
export function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * 综合水平更新：加权平均。
 * 规则：最近一次权重最高，历史递减；避免单次发挥好就跳分。
 * bands: 本次评估的四维 band；recentOverall: 最近几次的 overall 数组（新的在前）
 */
export function updateOverallBand(
  currentOverall: number,
  newBands: BandScores,
  recentOverall: number[],
): number {
  // 本次分数 = 四维平均
  const thisBand = averageOverall(newBands);
  // 历史序列（含当前），新的在前
  const series = [thisBand, ...recentOverall].slice(0, 5);
  // 权重：最近的权重更高（0.4, 0.25, 0.15, 0.12, 0.08）
  const weights = [0.4, 0.25, 0.15, 0.12, 0.08].slice(0, series.length);
  const wSum = weights.reduce((s, w) => s + w, 0);
  const weighted = series.reduce(
    (s, b, i) => s + b * weights[i],
    0,
  );
  const result = weighted / wSum;
  // 与当前水平取加权，平滑过渡
  const smoothed = currentOverall * 0.3 + result * 0.7;
  return roundHalf(smoothed);
}

/** 从评估结果生成阶段路径（当前 → 目标 的 3 步描述） */
export function buildStagePath(current: number, target: number): string[] {
  const gap = target - current;
  if (gap <= 0) {
    return [
      "你已经达到或超过目标分数，保持当前训练节奏，尝试更高目标的题目。",
    ];
  }
  const steps: string[] = [];
  const mid = roundHalf(current + gap / 2);
  steps.push(`稳定在 ${current} 分：减少语法错误，补充原因和例子，用自然的连接方式。`);
  steps.push(`提升到 ${mid} 分：加入更具体的细节和个人故事，替换重复的低级词汇。`);
  steps.push(`冲刺 ${target} 分：使用更复杂句式，主动组织结构，应对追问时展开观点。`);
  return steps;
}

/**
 * 规划阶段目标（activeStageBand）：
 * 从当前水平到最终目标的中间档位，首个为当前训练目标。
 * 例：当前 5.0、目标 8.0 → [6.5, 7.0, 8.0]（PRD 5.1）
 * 当前 5.0、目标 6.5 → [6.0, 6.5]
 * 差距 ≤ 0.5 时直接取最终目标。
 */
export function planStageBands(current: number, finalGoal: number): number[] {
  const gap = finalGoal - current;
  if (gap <= 0.5) {
    return [roundHalf(finalGoal)];
  }
  // 首档：从当前到目标的中位档（如 5.0→8.0 取 6.5）
  const first = roundHalf(current + gap / 2);
  const stages: number[] = [first];
  // 剩余档位：从 first 以 0.5 步进到 finalGoal
  let band = roundHalf(first + 0.5);
  while (band < finalGoal) {
    stages.push(roundHalf(band));
    band = roundHalf(band + 0.5);
  }
  stages.push(roundHalf(finalGoal));
  return [...new Set(stages)];
}

/** 取当前训练目标（阶段目标第一个档位） */
export function activeStageBand(
  current: number | undefined,
  finalGoal: number | undefined,
): number {
  if (typeof finalGoal !== "number") return 6.5;
  if (typeof current !== "number") return roundHalf(finalGoal);
  return planStageBands(current, finalGoal)[0];
}
