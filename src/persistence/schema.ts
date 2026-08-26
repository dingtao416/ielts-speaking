import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// Generated from the Better Auth configuration with `auth@1.6.25 generate`.
// Keep the exported model names stable because the Drizzle adapter resolves
// these names at runtime.
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    username: text("username"),
    displayUsername: text("display_username"),
    // 雅思个性化能力档案
    targetBand: numeric("target_band"),          // 目标分数，如 6.5
    profile: jsonb("profile").$type<AbilityProfile>(), // 能力档案
    onboarded: boolean("onboarded").default(false).notNull(),
    onboardedAt: timestamp("onboarded_at"),
    // V1：标准题诊断/复测维护的档案（PRD §7 UserProfile）
    finalGoalBand: numeric("final_goal_band", { precision: 3, scale: 1 }), // 最终目标分
    currentBand: numeric("current_band", { precision: 3, scale: 1 }),      // 当前综合水平
    activeStageBand: numeric("active_stage_band", { precision: 3, scale: 1 }), // 当前训练目标
    stagePlan: jsonb("stage_plan").$type<string[]>().default(sql`'[]'::jsonb`), // 阶段路径
    diagnosticStatus: varchar("diagnostic_status", { length: 16 })
      .default("none"), // none | in_progress | completed
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("user_username_uq").on(table.username)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// ===== 雅思业务表 =====

// 答题框架（素材本）
export const frameworks = pgTable(
  "framework",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    topic: varchar("topic", { length: 200 }).notNull(),
    part: integer("part").notNull(), // 1 | 2 | 3
    sourceQuestionId: varchar("source_question_id", { length: 200 }),
    sourceYear: integer("source_year"),
    structure: jsonb("structure")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    keyPoints: jsonb("key_points")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    expressions: jsonb("expressions")
      .$type<{ phrase: string; meaning: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    stories: jsonb("stories")
      .$type<StoryMaterial[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    intro: text("intro"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("framework_user_topic_idx").on(table.userId, table.topic)],
);

// 练习记录（历史 / 能力曲线）
export const sessionRecords = pgTable(
  "session_record",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: varchar("question_id", { length: 200 }),
    topic: varchar("topic", { length: 200 }),
    part: integer("part"), // 1 | 2 | 3
    mode: varchar("mode", { length: 16 }).notNull(), // 'train' | 'recite'
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    durationSec: integer("duration_sec").notNull(),
    fullText: text("full_text").notNull(),
    stats: jsonb("stats").$type<TextStats>().notNull(),
    bands: jsonb("bands").$type<BandScores>(),  // 四维 + overall band 评估
    bandEstimate: numeric("band_estimate", { precision: 3, scale: 1 }),
    reportMarkdown: text("report_markdown"),
    feedback: jsonb("feedback").$type<RoundFeedback>(), // 单题表达反馈（推荐回答/词汇/语法/改写）
    frameworkId: varchar("framework_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("session_record_user_start_idx").on(table.userId, table.startTime)],
);

export type FrameworkRecord = typeof frameworks.$inferSelect;
export type NewFrameworkRecord = typeof frameworks.$inferInsert;
export type SessionRecord = typeof sessionRecords.$inferSelect;
export type NewSessionRecord = typeof sessionRecords.$inferInsert;

// 与 src/lib/lexicon.ts 的 TextStats 保持一致
export interface TextStats {
  totalWords: number;
  fillers: number;
  hedges: number;
  vagueWords: number;
  chinglish: number;
  grammar: number;
  density: number;
  duration: number;
}

// 雅思四维评分（Band 0-9，可带 .5）
export interface BandScores {
  fluency: number;         // 流利度与连贯性
  lexical: number;         // 词汇资源
  grammar: number;         // 语法范围与准确性
  pronunciation: number;   // 发音与可理解度
  overall: number;         // 综合
}

// 单题表达反馈（AI 教练流程，不包含数值评分）
export interface RoundFeedback {
  recommendedAnswer?: string;
  vocabularyHighlights?: { original: string; suggestion: string; note?: string }[];
  grammarNotes?: string;
  naturalRewrite?: string;
  degraded?: boolean;
}

// 个人能力档案
export interface AbilityProfile {
  overallBand: number;        // 当前综合水平
  targetBand: number;         // 目标分数
  dimensions: BandScores;     // 四维 band
  mainIssues: string[];       // 当前最主要的问题
  stagePath: string[];        // 从当前到目标的阶段路径
  updatedAt: string;          // 最近评估时间
}

// 框架故事素材（从用户回答中提取的可复用个人故事）
export interface StoryMaterial {
  title: string;              // 故事标题
  characters: string[];       // 人物
  setting: string;            // 场景/地点
  events: string[];           // 事件经过
  applyToTopics: string[];    // 可应用于的话题
}

// ===== V1 练习模型（PRD §7）=====

// 练习会话：创建时冻结题组（PRD 4.3 / FR-002 / FR-003）
export const practiceSessions = pgTable(
  "practice_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 'personal_background' | 'standard_topic'（PRD 4.1）
    mode: varchar("mode", { length: 32 }).notNull(),
    // 熟悉话题：大类 id（work_study/hometown/residence）；标准话题：题组 id（st-*）
    topicSetKey: varchar("topic_set_key", { length: 200 }).notNull(),
    bankVersion: varchar("bank_version", { length: 64 }).notNull(),
    // 硬隔离：熟悉话题恒为 false，只有标准题可进诊断（FR-008）
    diagnosticEligible: boolean("diagnostic_eligible")
      .notNull()
      .default(false),
    // in_progress | completed | abandoned
    status: varchar("status", { length: 16 }).notNull().default("in_progress"),
    // 题组完成后的总结缓存（标准话题：训练预估/判定依据/优化点；熟悉话题：null）
    summary: jsonb("summary").$type<SessionSummary>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("practice_session_user_start_idx").on(table.userId, table.startedAt),
  ],
);

// 冻结题目投递：会话创建时写死 questionId/顺序/题文快照/bankVersion（FR-003/004）
export const questionDeliveries = pgTable(
  "question_delivery",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => practiceSessions.id, { onDelete: "cascade" }),
    questionId: varchar("question_id", { length: 200 }).notNull(),
    orderNo: integer("order_no").notNull(),
    textSnapshot: text("text_snapshot").notNull(),
    // 冻结时的话题展示名（熟悉话题=大类 label；标准话题=题组 topic）
    topic: varchar("topic", { length: 200 }).notNull(),
    bankVersion: varchar("bank_version", { length: 64 }).notNull(),
    // 'personal_background_fixed' | 'standard_published'
    deliverySource: varchar("delivery_source", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("question_delivery_session_order_uq").on(
      table.sessionId,
      table.orderNo,
    ),
  ],
);

// 单题回答：同一回答可重试反馈，但不得重复建答（FR-007）
export const responseAttempts = pgTable(
  "response_attempt",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => practiceSessions.id, { onDelete: "cascade" }),
    questionDeliveryId: text("question_delivery_id")
      .notNull()
      .references(() => questionDeliveries.id, { onDelete: "cascade" }),
    // 本地 IndexedDB 音频键（音频默认本机保存）
    audioRef: varchar("audio_ref", { length: 200 }),
    finalTranscript: text("final_transcript").notNull(),
    durationSec: integer("duration_sec").notNull().default(0),
    // manual | timeout | asr_failed | manual_input | skipped
    endedBy: varchar("ended_by", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("response_attempt_session_delivery_uq").on(
      table.sessionId,
      table.questionDeliveryId,
    ),
    index("response_attempt_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

// 单题反馈：两种话题类型结构一致；熟悉话题不含 Band（FR-006）
export const responseFeedback = pgTable(
  "response_feedback",
  {
    id: text("id").primaryKey(),
    responseAttemptId: text("response_attempt_id")
      .notNull()
      .references(() => responseAttempts.id, { onDelete: "cascade" })
      .unique(),
    activeStageBand: numeric("active_stage_band", { precision: 3, scale: 1 }),
    vocabularyHighlights: jsonb("vocabulary_highlights")
      .$type<VocabularyHighlight[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    naturalRewrite: text("natural_rewrite"),
    // pending | ok | degraded（FR-007 降级）
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    feedbackVersion: varchar("feedback_version", { length: 32 }),
    modelVersion: varchar("model_version", { length: 64 }),
    schemaVersion: varchar("schema_version", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("response_feedback_attempt_idx").on(table.responseAttemptId)],
);

// 诊断评估：只能引用标准题回答；未完成不得覆盖正式档案（FR-009）
export const diagnosticAssessments = pgTable(
  "diagnostic_assessment",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => practiceSessions.id, { onDelete: "cascade" }),
    standardResponseIds: jsonb("standard_response_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    bandEvidence: jsonb("band_evidence").$type<BandEvidence>(),
    activeStageBand: numeric("active_stage_band", { precision: 3, scale: 1 }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    // in_progress | completed
    status: varchar("status", { length: 16 }).notNull().default("in_progress"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("diagnostic_assessment_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export type PracticeSession = typeof practiceSessions.$inferSelect;
export type NewPracticeSession = typeof practiceSessions.$inferInsert;
export type QuestionDelivery = typeof questionDeliveries.$inferSelect;
export type NewQuestionDelivery = typeof questionDeliveries.$inferInsert;
export type ResponseAttempt = typeof responseAttempts.$inferSelect;
export type NewResponseAttempt = typeof responseAttempts.$inferInsert;
export type ResponseFeedback = typeof responseFeedback.$inferSelect;
export type NewResponseFeedback = typeof responseFeedback.$inferInsert;
export type DiagnosticAssessment = typeof diagnosticAssessments.$inferSelect;
export type NewDiagnosticAssessment = typeof diagnosticAssessments.$inferInsert;

// 核心埋点事件（PRD §8；不接收转写/音频/PII）
export const analyticsEvents = pgTable(
  "analytics_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    props: jsonb("props")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("analytics_event_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;

// 词汇建议（最多 3 项，FR-006）
export interface VocabularyHighlight {
  original: string;
  suggestion: string;
  note?: string;
}

// 会话总结缓存（标准话题：训练用途预估；熟悉话题不生成 Band）
export interface SessionSummary {
  estimate?: number | null; // 标准话题训练预估；熟悉话题恒为 null
  basis?: string;           // 判定依据
  nextFocus?: string[];     // 下次优化点
  generatedAt?: string;
}

// 诊断证据：无有效音频证据的维度为 null（显示"未评估"），不生成数值（FR-009 / NFR）
export interface BandEvidence {
  dimensions: {
    fluency: number | null;
    lexical: number | null;
    grammar: number | null;
    pronunciation: number | null;
  };
  overall: number;
  notes: string[];
}
