# V1 工程 PRD · 现状差异分析与执行计划

> 对照来源：`ielts-part1-ai-coach-v1-prd.md`（V1 工程 PRD，2026-08-13 问答确认稿）。
> 现状核对：2026-08-14，逐文件核对 `src/`、`data/`、`drizzle/`。
> 状态：**✅ 实施完成（2026-08-14）**。Phase 0-6 全部落地：迁移 0004-0006 已应用、API 与数据层端到端冒烟通过（含真实 LLM 反馈/总结/诊断链路）、typecheck/lint/build 全绿。剩余人工 QA：浏览器麦克风录制与转写确认页交互走查。

---

## 1. 工作区现状摘要（基线）

| 层 | 现状 |
| --- | --- |
| 技术栈 | Next.js 16.3（App Router）+ React 19 + TS + Tailwind 4；better-auth 1.6.25；drizzle 0.45 + PostgreSQL；Web Speech API（浏览器端 ASR）；DeepSeek（服务端 LLM） |
| 页面 | `/`（落地页）、`/bank`（题库浏览）、`/practice/[questionId]`（单题训练）、`/practice/topic/[topic]`（AI 教练多题会话）、`/recite/[questionId]`、`/library`、`/progress`、`/settings`、`/login`、`/onboarding`、`/speech-test` |
| 主流程 | `ai-coach-session.tsx`：按话题进入 → **`/api/follow-up` AI 逐题生成问题** → 每话题 3 问（可追加第 4 问追问）→ 30 秒录音（MediaRecorder 本地 IndexedDB + Web Speech 实时转写）→ 词汇本地标黄 → `/api/grammar-feedback` 语法/改写 + `/api/response-feedback` SSE 推荐回答 → 话题总结 `/api/topic-summary`（**LLM 生成 Band 预估**）→ S7/S8 结束页；sessionStorage 快照恢复 |
| 数据 | `data/question-bank/{real,predicted}/index.json` 静态题库（real 2021-2025、predicted 2026）；无 status/version/source 字段；无"熟悉话题"题集 |
| 持久化 | `session_record` 表（按题一条，mode=`train`/`recite`）+ `framework` 表 + `user`（targetBand/profile jsonb/onboarded）；无会话、投递、反馈、诊断实体 |
| 诊断 | `onboarding-flow.tsx`：设目标分 → **Part1/2/3 各 1 题共 3 题** → `/api/diagnostic` 一次性生成 AbilityProfile → 写 `user.profile` |
| 历史 | `progress-panel.tsx`：session_record 平铺列表 + 四维趋势图；无话题分组、无删除、无"再练一次" |
| 埋点 | 无 |
| 质量基座 | 已有：鉴权写覆盖（服务端取 actor.userId）、错误/降级 UI 模式、Modal/Button/AudioPlayback 组件、zh/en i18n（`dict.ts`）、eslint/typecheck/build 脚本 |

---

## 2. 差异分析（V1 PRD vs 现状）

### 2.1 结构性差异（信息架构与主流程）

| # | PRD 要求 | 现状 | 差距 |
| --- | --- | --- | --- |
| D1 | **FR-001 二选一练习入口**：练习首页先选"熟悉话题/标准话题" | 无"练习"首页；首页 CTA 直接去 `/bank` | 🔴 缺失，需新页面 `/practice` + 导航调整 |
| D2 | **FR-002 熟悉话题**：work_study/hometown/residence 三大类固定题集（3-4 题）、独立版本、不调用生成服务 | 无熟悉话题题集数据；hometown/work/education 散落在真题/预测题中且题量不足；无版本概念 | 🔴 缺失，需新数据资产 + 加载器 |
| D3 | **FR-003 标准话题准入**：年份/最新话题 → Part → 标准话题 → 已发布题组；会话冻结 questionId/顺序/题文快照/bankVersion | `/bank` 用"真题/预测题 + 年份 + 话题"平铺筛选；**无"最新话题"入口**；无 published 过滤、无冻结概念；练习按 topic 进 AI 生成流程 | 🔴 缺失，需层级页 + 发布状态 + 会话冻结 |
| D4 | **FR-004 下一题规则**：从冻结题组按固定顺序展示，不生成/改写/重排 | `loadQuestion()` 每轮调 `/api/follow-up` 由 LLM 生成题目，第 4 问为针对性追问 | 🔴 冲突：V1 主流程必须移除 AI 生成/追问 |
| D5 | **FR-005 录音与转写确认**：30 秒倒计时 + 实时转写；停止/超时后进入**确认页**（编辑最终转写/重录/手动补写/跳过），确认非空后才保存并请求反馈 | 停止录音后**直接进入反馈**，最终转写 = ASR 最后文本，无确认页、无编辑、无手动补写、无跳过；超时自动停止（有） | 🟠 部分：需新增确认阶段与降级路径 |
| D6 | **FR-006 两种模式共用反馈**：最终转写 + 最多 3 项词汇建议 + 保留原意的阶段匹配自然改写；服务端 schema 校验 + feedbackVersion/model/schema | 反馈 = 本地词库标黄（**无 3 项上限**）+ 语法 Notes + 自然改写 + SSE 推荐回答；**无服务端 schema 校验、无版本字段**；推荐回答超出 V1 反馈结构 | 🟠 部分：需重定义反馈契约（推荐回答是否保留待定，见决策 D-2） |
| D7 | **FR-007 反馈失败降级**：先保存回答；失败显示"回答已保存，反馈暂不可用"；可重试；不重复建答 | 回答先写 `session_record`（有）；失败时静默留空，无降级文案；**无幂等键**（重试可能重复建答） | 🟠 部分：需幂等 + 降级 UI |
| D8 | **FR-008 熟悉话题诊断隔离** | 无会话实体，`mode` 只有 train/recite，无 `diagnosticEligible` 硬隔离 | 🔴 缺失，需会话模型 + 服务端隔离 |
| D9 | **FR-009 标准题诊断**：固定诊断包 8 道有效标准题、未完成不覆盖、证据状态、发音无音频"未评估"、升级建议+确认 | 首诊 = 3 题（Part1/2/3 各 1）+ 一次性 LLM 档案；无 8 题包、无进度保留、无证据状态、发音无音频也出数值、无升级确认 | 🔴 冲突：需重构诊断 |
| D10 | **FR-010 历史**：按话题类型分组、先复盘后"再练一次"、删除记录 | 平铺列表；无分组/复盘入口/再练/删除；无 DELETE API | 🔴 缺失 |
| D11 | 埋点（18 个核心事件 + 护栏指标） | 无任何事件 | 🔴 缺失 |

### 2.2 数据模型差异

| PRD 实体 | 现状 | 差距 |
| --- | --- | --- |
| `PersonalBackgroundTopicSet` | 无 | 新增内容资产（建议静态数据 + version） |
| `StandardTopicSet` | real/predicted JSON 无 scope/status/source/bankVersion | 扩展数据格式 + 发布过滤 |
| `PracticeSession` | 无（sessionStorage 客户端快照） | 新表 |
| `QuestionDelivery` | 无（题目由 AI 现生成） | 新表 + 冻结逻辑 |
| `ResponseAttempt` | `session_record` 近似但无 deliveryId/endedBy/audioRef 语义 | 新表或改造（见决策 D-4） |
| `LiveTranscriptEvent` | 无 | 新表（学习数据，可后置） |
| `ResponseFeedback` | `session_record.feedback` jsonb，无版本/状态 | 新表或扩展 |
| `DiagnosticAssessment` | 无（user.profile 一次写入） | 新表 |
| `UserProfile` | user.targetBand + user.profile jsonb（AbilityProfile） | 需 finalGoalBand/currentBand/activeStageBand/stagePlan/diagnosticStatus |

### 2.3 已满足/可复用的部分

- 鉴权 + 资源归属（写接口服务端覆盖 userId）✅
- 录音采集（MediaRecorder → IndexedDB 本地音频）、30 秒倒计时、Web Speech 实时转写、ASR 失败保留文本 ✅
- 实时转写黄色词汇标记（`highlightVagueOnly`，仅实时层）✅
- SSE 流式（`useStreamText`，反馈首字性能基础）✅
- 无障碍模式（role=timer/alert/progressbar、aria-live、Modal 焦点管理）✅
- i18n zh/en、设计 token、Button/Modal/AudioPlayback 组件 ✅
- `activeStageBand`/`planStageBands` 阶段规划工具（需服务端化）✅
- `/api/topic-summary` 训练预估结构（判定依据/优化点可复用，Band 展示按模式裁剪）✅

---

## 3. 关键设计决策（默认值 + 待确认）

| 编号 | 决策点 | 推荐默认 | 待确认 |
| --- | --- | --- | --- |
| D-1 | "最新话题"入口解析 | = 最新已发布年份的题组（2026 predicted，标注"最新话题"）；与具体年份按钮并列 | 是否允许跨年混合？建议不允许 |
| D-2 | 单题反馈是否保留"推荐回答" | ✅ **已确认**：移除 `recommendedAnswer`，V1 反馈主体 = 保留原意 `naturalRewrite` + 词汇建议 ≤3 | 影响 /api/response-feedback 重构 |
| D-3 | 标准话题总结是否显示训练预估（Band） | ✅ **已确认**：标准话题显示"训练用途预估"（复用 topic-summary，明确非官方）；熟悉话题**不显示** Band、不生成预估 | PRD 只禁止熟悉话题 Band |
| D-4 | 回答记录落库方案 | 新增 `response_attempt` 表承接 V1 两模式全部回答（含 feedback 关联）；遗留 `session_record` 保留给 `/practice/[questionId]`、`/recite` 旧链路，历史页双源展示 | 或统一迁移旧链路，成本高，不建议 V1 做 |
| D-5 | onboarding 首诊是否替换为 V1 诊断 | ✅ **已确认**：替换：onboarding = 设最终目标分 → 8 道标准题诊断包（Part 1 only，与 FR-009 对齐）；删除 Part2/3 各 1 题旧流程 | 旧 3 题诊断数据作废 |
| D-6 | 旧 AI 教练入口与 follow-up 端点处置 | `/practice/topic/[topic]`、`/api/follow-up`、`getFollowUpQuestionPrompt` 从主流程移除（V1 非目标：AI 追问/生成）；`/bank` 练习按钮改指向新标准话题流程 | 是否物理删除 vs 留档禁用，建议物理删除 |
| D-7 | 词汇建议来源 | 服务端 LLM 生成（zod 校验，≤3 项，含 original/suggestion/note）；客户端词库仅保留实时标黄（学习数据，非反馈） | 依赖 LLM 成本；失败走 FR-007 降级 |
| D-8 | 熟悉话题题集内容 | 由教研提供；实现先行内置 v1 占位题集（3 大类 × 3-4 题），文件内标注"教研占位，发布前审核"，版本号独立 | PRD 待确认 11.1 |
| D-9 | `LiveTranscriptEvent` 是否 V1 入库 | 先不入库（实时转写仅客户端展示 + 最终转写落库）；表结构预留 | PRD 数据模型列出但非功能要求可后置 |

---

## 4. 数据模型与迁移（drizzle migration 0004）

```text
practice_session            # 新表：会话（冻结）
  id PK, user_id FK, mode('personal_background'|'standard_topic'),
  topic_set_key varchar, bank_version varchar,
  diagnostic_eligible bool NOT NULL,        # personal_background 恒 false
  status('in_progress'|'completed'|'abandoned'),
  started_at, ended_at, created_at

question_delivery           # 新表：冻结投递（会话创建时写死）
  id PK, session_id FK, question_id varchar, order_no int,
  text_snapshot text, bank_version varchar,
  delivery_source('personal_background_fixed'|'standard_published'),
  UNIQUE(session_id, order_no)

response_attempt            # 新表：单题回答（FR-007 幂等：UNIQUE(session_id, question_delivery_id)）
  id PK, user_id FK, session_id FK, question_delivery_id FK,
  audio_ref varchar NULL,                    # 本地 IndexedDB 键
  final_transcript text, duration_sec int, ended_by('manual'|'timeout'|'asr_failed'|'manual_input'|'skipped'),
  created_at, updated_at

response_feedback           # 新表：反馈（重试只更新，不重复建答）
  id PK, response_attempt_id FK UNIQUE,
  active_stage_band numeric, vocabulary_highlights jsonb,   # ≤3 项
  natural_rewrite text, status('ok'|'degraded'|'pending'),
  feedback_version varchar, model_version varchar, schema_version varchar,
  created_at, updated_at

diagnostic_assessment       # 新表：诊断（未完成不覆盖正式档案）
  id PK, user_id FK, session_id FK,
  standard_response_ids jsonb, band_evidence jsonb,   # 四维 + 证据状态
  active_stage_band numeric, confidence numeric,
  status('in_progress'|'completed'), created_at, completed_at

user                        # 扩展列（better-auth 表只加列不改名）
  + final_goal_band numeric, + current_band numeric, + active_stage_band numeric,
  + stage_plan jsonb, + diagnostic_status varchar('none'|'in_progress'|'completed')

live_transcript_event       # 预留表（D-9 后置，可本阶段建表不写数据）
```

内容资产（不进 DB，沿用静态 JSON + 构建期加载，与现有 bank 一致）：

```text
data/personal-background/index.json   # 熟悉话题：{version, categories:{work_study|hometown|residence:{name, questions[]}}}
data/standard-topics/index.json       # 标准题组清单：{bankVersion, sets:[{scope:'year'|'latest', year?, part:1, topic, source, status:'published', questionIds[]}]}
```

- `bank.ts` 扩展：`getFamiliarCategories()`、`getFamiliarSet(category)`、`getStandardTopicSets({scope, year, part})`（只返回 published）、`getSetById`。
- 标准题 questionIds 引用现有 real/predicted 的题目 id（hometown 等已有），缺的题由内容资产补齐（data 文件补条目）。
- 熟悉话题三类题集 id 空间独立（`pb-work-study-01` 等），与标准题不共享 id（PRD 4.2）。

---

## 5. 分阶段执行计划

### Phase 0 · 决策冻结与基线（0.5-1 天）

- 确认 §3 决策项 D-1 ~ D-9（尤其 D-2/D-3/D-5/D-6）。
- 基线校验：`npm run typecheck` / `lint` / `build` 全绿（AGENTS.md 提示 Next 16 有破坏性变更，编码前先读 `node_modules/next/dist/docs/` 相关指南）。
- **验收**：决策清单签字；基线三命令通过。

### Phase 1 · 内容资产与数据层（1-2 天）

- 新建 `data/personal-background/index.json`：3 大类 × 3-4 题 v1 占位题集（含版本号、status、教研审核 TODO）。
- 新建 `data/standard-topics/index.json`：从现有 real/predicted 提取 Part 1 题组，补充 scope/part/topic/source/status/bankVersion/questionIds；2026 predicted 标记为最新话题。
- `src/lib/bank.ts` 扩展加载器与查询函数（含只返回 published 的过滤）。
- `src/persistence/schema.ts` 新增 §4 表与 user 扩展列；`npm run db:generate` 生成迁移 0004；`db:migrate` 应用。
- **验收**：数据加载单测/脚本输出题组数量与顺序稳定；迁移可回滚；typecheck 通过。

### Phase 2 · 会话冻结与反馈 API（1-2 天）

- `POST /api/practice-sessions`：校验 mode/topicSetKey → 读取 published 题集 → 创建会话 + 批量写入 question_delivery（冻结快照与 bankVersion）；返回 sessionId + 题目列表。熟悉话题强制 `diagnosticEligible=false`。
- `GET /api/practice-sessions/[id]`：恢复会话（题目序列 + 已完成回答）；刷新/断网不改变序列。
- `POST /api/response-attempts`：幂等建答（按 session+delivery 唯一），支持 endedBy 与本地 audioRef；保存先于反馈。
- `POST /api/response-feedback`（重构）：入参 attemptId → 服务端校验归属 → LLM 生成 {vocabularyHighlights ≤3, naturalRewrite} → **zod schema 校验** → 写 response_feedback（upsert，feedbackVersion/modelVersion/schemaVersion）→ naturalRewrite 走 SSE 流式（首字 <8s 目标）；失败/超时 → status=degraded + 不重复建答。
- `DELETE /api/sessions/[id]`（含 attempts/feedback 级联，FR-010）。
- **验收**：同一回答重试反馈不产生重复记录；冻结序列在并发/重试下不变；校验失败返回可识别错误码。

### Phase 3 · 练习 UI：双入口 + 共用会话运行器（2-3 天）

- 新页面 `/practice`（FR-001 二选一卡片，登录拦截）。
- 新页面 `/practice/familiar`（大类选择 → 创建会话 → 跳转会话页）。
- 新页面 `/practice/standard`：年份/最新话题 → Part（1 开放，2/3 未开放）→ 标准话题列表（published）→ 创建会话。
- 新会话页 `/practice/session/[id]`（两模式共用 `practice-runner.tsx`）：
  - 问题展示（冻结顺序 + 题号）→ 录音（30s 倒计时 + 实时转写标黄）→ **转写确认页**（编辑/重录/手动补写/跳过，非空确认后才保存）→ 反馈页（最终转写 + ≤3 词汇建议 + 流式自然改写 + 降级文案"回答已保存，反馈暂不可用" + 重试）→ 用户点"下一题"（不自动跳）。
  - 会话恢复：`GET` 会话 API 重建到最近未完成题；录音状态恢复为准备录音。
- 移除 `ai-coach-session.tsx` 对 `/api/follow-up` 的依赖；按 D-6 删除旧端点/旧页面（保留 `/practice/[questionId]` 单题链路）。
- i18n：`dict.ts` 补全部新文案（zh/en）。
- **验收**：走通"熟悉话题 1 个大类 + 标准话题 1 个题组"完整闭环；刷新后题目序列不变；FR-005/007 场景手动过一遍。

### Phase 4 · 总结与历史（1-2 天）

- 总结页：熟悉话题总结（完成题数、词汇汇总、**无 Band、无预估**、训练用途声明）；标准话题总结（训练用途预估 + 判定依据 + 下次优化点，按 D-3）。
- `/progress` 重构：V1 会话按"话题类型（熟悉/标准）→ 话题组"分组；打开记录先复盘（复用总结视图）；"再练一次"→ `POST /api/practice-sessions` 新建同类型会话（repractice_started）；删除记录（record_deleted）；遗留 session_record 保持平铺展示。
- **验收**：历史分组正确；再练一次新建会话且不覆盖旧记录；删除级联干净。

### Phase 5 · 诊断与能力档案（1-2 天）

- 新诊断流程（替换 onboarding 旧 3 题）：设/确认最终目标分 → 固定 8 题标准题诊断包（2 个标准话题 × 4 题，published，不含熟悉话题）→ 逐题复用 runner → 完成 8 道有效回答后 `POST /api/diagnostic` 生成 bandEvidence（四维 + 证据状态；**无有效音频证据时 pronunciation="未评估"**，不生成发音数值）→ 写 DiagnosticAssessment(completed) + user 档案列（finalGoalBand/currentBand/activeStageBand/stagePlan/diagnosticStatus）。
- 中断保留：diagnostic_assessment(status=in_progress) + 会话恢复；未完成不得覆盖 currentBand。
- 阶段升级：系统按证据建议下一档 → 用户确认 → 更新 activeStageBand（stage_target_changed）；熟悉话题记录永不触发。
- **验收**：8 题完成生成档案；中断恢复不重复答题；无音频维度显示"未评估"。

### Phase 6 · 埋点、收尾与验收（1 天）

- `src/lib/analytics.ts` + `POST /api/events`（analytics_event 表，不含转写/音频/PII）：接入 PRD §8 全部 18 个核心事件（practice_mode_selected … record_deleted）。
- 护栏指标可观测：题目顺序错误率 0、生成调用数 0（follow-up 端点删除后天然满足）、schema 通过率（response_feedback 记 status 统计）。
- 无障碍与性能检查：新页面状态多模态提示、aria-live；会话创建 P95<1.5s、本地保存<300ms、反馈首字<8s（SSE 已有基础）。
- 全量回归：`typecheck` + `lint` + `build` + 手动 QA 清单（FR-001 ~ FR-010 逐条）。
- 更新 `gap-analysis.md`/`ui-ux-review.md` 或新建 V1 核对清单归档。

---

## 6. 验收映射（FR → 验证方式）

| FR | 验证 |
| --- | --- |
| FR-001 | `/practice` 两入口，选中后只能进对应模式 |
| FR-002 | 熟悉话题会话无生成调用（网络面板无 /api/follow-up）；题量=配置 |
| FR-003 | 只展示 published 题组；DB 中 question_delivery 含快照与 bankVersion |
| FR-004 | 连续点击下一题，序列与创建时一致（含刷新后） |
| FR-005 | 停止/超时进确认页；编辑/重录/手动补写/跳过可用；未确认不请求反馈 |
| FR-006 | 两模式反馈结构一致；词汇建议 ≤3；改写保留原意（人工抽检） |
| FR-007 | 反馈失败显示降级文案；重试不重复建答（attempt 唯一约束） |
| FR-008 | personal_background 会话 diagnostic_eligible=false；诊断接口只接受标准题 attempt |
| FR-009 | 8 题诊断包完成生成档案；中断不覆盖；无音频发音="未评估" |
| FR-010 | 历史按类型分组；复盘→再练创建新会话；删除级联 |

---

## 7. 风险与依赖

| 风险 | 缓解 |
| --- | --- |
| 熟悉话题题集内容未定 | v1 占位题集 + 独立版本号，上线前教研审核替换（D-8） |
| 标准题组 published/来源数据不齐 | Phase 1 由现有题库提取 + 人工核对清单，缺题补充数据文件 |
| 反馈 LLM 成本与延迟 | 单次调用生成结构化反馈 + 流式改写；失败降级不阻塞主流程（FR-007） |
| 历史双源（response_attempt vs session_record）展示混乱 | 分组时明确来源标签；V1 模式只读新表 |
| Next 16 破坏性变更 | 编码前读 `node_modules/next/dist/docs/` 相关章节（AGENTS.md 强制） |
| 诊断包具体题组/证据阈值未定（PRD 11.3） | 先用固定 2 话题 × 4 题；阈值规则集中常量，待教研确认后调整 |

---

## 8. 排期汇总

| Phase | 内容 | 预估 |
| --- | --- | --- |
| 0 | 决策冻结 + 基线 | 0.5-1 天 |
| 1 | 内容资产 + 数据模型 + 迁移 | 1-2 天 |
| 2 | 会话冻结 API + 反馈契约 | 1-2 天 |
| 3 | 双入口 UI + 共用运行器 | 2-3 天 |
| 4 | 总结 + 历史重构 | 1-2 天 |
| 5 | 诊断 + 档案 | 1-2 天 |
| 6 | 埋点 + 收尾验收 | 1 天 |

**总预估：7-13 个工作日**（不含教研题集产出与产品对 D-2/D-3/D-5 的决策时间）。

---

## 9. 实施记录（2026-08-14）

### 已交付

- **内容资产**：`data/personal-background/index.json`（3 大类 × 4 题，v1.0.0 占位，教研审核 TODO）；`data/standard-topics/index.json`（20 组已发布题组，2021-2025 历年 + 2026 最新，2 组标记诊断包）；预测题库 5 个最新话题扩至 4 题。
- **数据模型**：迁移 `0004`（practice_session/question_delivery/response_attempt/response_feedback/diagnostic_assessment + user 档案列）、`0005`（session.summary、delivery.topic）、`0006`（analytics_event）——已 `db:migrate` 应用。
- **API**：`POST/GET /api/practice-sessions`（创建冻结 + 列表）、`GET/PATCH/DELETE /api/practice-sessions/[id]`、`POST /api/response-attempts`（幂等建答）、`POST /api/response-feedback`（重写：词汇 ≤3 + 流式改写 + zod 校验 + 降级/缓存）、`POST /api/topic-summary`（重写：按会话、仅标准话题、写总结缓存并完结）、`POST /api/diagnostic`（重写：8 题诊断包 + 证据状态 + 发音未评估 + 档案写入）、`POST /api/events`（18 事件白名单）、`/api/profile` 扩展 V1 档案列。
- **UI**：`/practice` 二选一、`/practice/familiar` 大类选择、`/practice/standard` 年份/最新话题 → Part → 话题、`/practice/session/[id]` 共用运行器（录音 → 转写确认 → 反馈 → 冻结下一题）、诊断结果页、进度页 V1 历史分组（复盘/再练/删除）、onboarding 重写（设目标分 → 8 题诊断）、导航/首页/题库入口接线。
- **删除（D-6）**：`/practice/topic`、`ai-coach-session.tsx`、`topic-summary.tsx`、`vocab-linking.tsx`、`/api/follow-up`、`/api/grammar-feedback` 及 4 个遗留 prompt。
- **环境修复**：`.env.local` DATABASE_URL 端口 5433 → 55433（本机 PG 实例）；`seed-test-user.ts` 补 `.env.local` 加载。
- **LLM 适配**：`deepseek-v4-pro` 为推理模型，思维链先耗 tokens——反馈/总结/诊断调用的 maxTokens 调至 2048-3000。

### 验证结果

- `scripts/v1-smoke.ts` 数据层 37 项全过；typecheck/lint/build 全绿。
- API 冒烟（真实登录 + 真实 LLM）：会话冻结/幂等建答/恢复/列表计数（修复 join 乘法）/删除/400 护栏全过；反馈 3 项词汇 + 171 字流式改写 + 重试命中缓存；诊断 8 题完成（current=5、active=6、发音无音频=未评估、档案写入）；总结 estimate=5.5 + 依据 + 2 条优化点；诊断/熟悉话题禁用总结 400。
- 待人工 QA：浏览器麦克风录音、Web Speech 转写、确认页编辑/重录/手动补写/跳过、移动端 HTTPS。

### 方向修正（2026-08-14 用户反馈）

用户确认：**不是重新做一套练习流程，而是在现有题库基础上按 PRD 改**。数据资产保留（`data/standard-topics/index.json` 题组清单、`data/personal-background/index.json` 熟悉话题题集），返工集中在入口：

- ✅ 标准话题选择回归现有 `/bank` 题库页：`bank-browser.tsx` 改造为「年份/最新话题 → Part（1 开放，2/3 未开放）→ 已发布标准话题题组」层级；练习按钮创建冻结会话 → `/practice/session/[id]`；latest（预测题）组保留逐题背记入口。
- ✅ 删除新做的 `/practice/standard` 选择页与 `standard-picker.tsx`（404 验证通过）。
- ✅ 练习首页 `/practice` 二选一保留（PRD 5.1 要求）；熟悉话题流程不变。
- ✅ 清理 `bank.ts` 中不再使用的旧筛选函数（getQuestions/getYears/getTopicsByYear/getNextTopic）。
- 会话页 `/practice/session/[id]` 与 `practice-runner.tsx` 保留：PRD 要求服务端冻结会话实体，AI 追问必须移除，这是对旧练习流程的改造而非平行新体系。
