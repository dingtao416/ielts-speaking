import type { FrameworkRecord, StoryMaterial } from "@/persistence/schema";

export interface FrameworkExpression {
  phrase: string;
  meaning: string;
}

export interface Framework {
  id: string;
  topic: string;
  part: number;
  sourceQuestionId?: string | null;
  sourceYear?: number | null;
  structure: string[];
  keyPoints: string[];
  expressions: FrameworkExpression[];
  stories: StoryMaterial[];
  intro?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toFramework(record: FrameworkRecord): Framework {
  return {
    id: record.id,
    topic: record.topic,
    part: record.part,
    sourceQuestionId: record.sourceQuestionId ?? null,
    sourceYear: record.sourceYear ?? null,
    structure: record.structure ?? [],
    keyPoints: record.keyPoints ?? [],
    stories: record.stories ?? [],
    expressions: record.expressions ?? [],
    intro: record.intro ?? null,
    createdAt: record.createdAt.toISOString?.() ?? String(record.createdAt),
    updatedAt: record.updatedAt.toISOString?.() ?? String(record.updatedAt),
  };
}

/** 框架转 Markdown（用于导出） */
export function frameworkToMarkdown(f: Framework): string {
  const lines: string[] = [];
  lines.push(`# ${f.topic} · Part ${f.part}`);
  lines.push("");
  if (f.intro) {
    lines.push(`> ${f.intro}`);
    lines.push("");
  }
  if (f.structure.length > 0) {
    lines.push("## 结构 Structure");
    f.structure.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push("");
  }
  if (f.keyPoints.length > 0) {
    lines.push("## 要点 Key Points");
    f.keyPoints.forEach((k) => lines.push(`- ${k}`));
    lines.push("");
  }
  if (f.expressions.length > 0) {
    lines.push("## 高分表达 Expressions");
    f.expressions.forEach((e) => lines.push(`- **${e.phrase}** — ${e.meaning}`));
    lines.push("");
  }
  return lines.join("\n");
}
