import { z } from "zod";

/**
 * V1 AI 输出 schema 校验（PRD §7：所有结构化 AI 输出必须服务端 schema 校验）。
 * 校验失败视为反馈失败，进入 FR-007 降级路径。
 */

export const FEEDBACK_SCHEMA_VERSION = "1.0.0";

/** 单题反馈：词汇建议 ≤3 项 + 保留原意自然改写（FR-006） */
export const v1FeedbackSchema = z.object({
  vocabularyHighlights: z
    .array(
      z.object({
        original: z.string().trim().min(1).max(200),
        suggestion: z.string().trim().min(1).max(200),
        note: z.string().trim().max(200).default(""),
      }),
    )
    .max(3),
  naturalRewrite: z.string().trim().min(1).max(2000).optional(),
});

export type V1Feedback = z.infer<typeof v1FeedbackSchema>;

/** 话题总结：训练预估 + 判定依据 + 下次优化点（标准话题） */
export const topicSummarySchema = z.object({
  estimate: z.number().min(0).max(9),
  basis: z.string().trim().min(1).max(2000),
  nextFocus: z.array(z.string().trim().min(1).max(200)).max(2),
});

export type V1TopicSummary = z.infer<typeof topicSummarySchema>;

/** 诊断：四维 band（可为 null=未评估）+ 综合 + 证据说明（FR-009） */
export const v1DiagnosticSchema = z.object({
  dimensions: z.object({
    fluency: z.number().min(0).max(9).nullable(),
    lexical: z.number().min(0).max(9).nullable(),
    grammar: z.number().min(0).max(9).nullable(),
    pronunciation: z.number().min(0).max(9).nullable(),
  }),
  overall: z.number().min(0).max(9),
  notes: z.array(z.string().trim().min(1).max(500)).max(6),
});

export type V1Diagnostic = z.infer<typeof v1DiagnosticSchema>;
