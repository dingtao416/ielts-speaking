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
