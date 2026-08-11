# 原型 vs 实现 · 差距分析清单

> 对照来源：`ielts-part1-interaction-spec.md`（S1–S10 交互规范）、`ielts-part1-ai-coach-mvp-prd.md`（MVP PRD）、`ielts-part1-wireframe-prototype.html`（可交互线框原型）。
>
> 核对日期：2026-08-11。实现侧逐文件核对（`src/`）。主流程 = AI 教练流程 `/practice/topic/[topic]`。

## 优先级定义

- **P0**：明确 BUG，直接影响现有功能显示，一行级别修复。
- **P1**：主流程完整性 —— 训练预估/判定依据、持久化、录音回放、复盘内容、下一话题、结束页分支。
- **P2**：结构与信息架构 —— 历史/目标页/入口锁定/细节补齐。

---

## P0 · BUG

- [x] **#8 SSE 流式协议不匹配 → 推荐回答/报告渲染带 JSON 外壳**
  - 服务端发送 `data: {"text": chunk}`；客户端 `useStreamText` 不 `JSON.parse`，把原始 JSON 直接拼进文本，导致 S5 推荐回答、报告显示 `{"text":"A"}{"text":"B"}…`。
  - 位置：`src/hooks/useStreamText.ts:69`；`src/app/api/response-feedback/route.ts:45`、`src/app/api/report/route.ts:41`、`src/app/api/llm/route.ts:39`。
  - ✅ 已修复：`useStreamText` 解析 `data:` JSON 取 `.text`；并让 `stream()` 返回 `{text, status}`（消除 await 后读陈旧 state 的隐患，`ai-coach-session` 与 `practice-session` 均改用返回值）。

---

## P1 · 主流程完整性

- [x] **#1 训练预估分（S6/S8）**
  - 原型：S6 顶部"话题训练预估"+ 标注"训练用途，非官方成绩"；S8"本次练习训练预估"。S5 不显示预估分。
  - 当前：S6 只显示"回答数量"。dict 已定义 `aiCoach.sessionEstimate` 等键但未使用。
  - 位置：`src/components/practice/topic-summary.tsx:62`、结束页。
  - ✅ 已修复：新增 `POST /api/topic-summary`（LLM 生成预估分+判定依据+优化点）；S6 渲染预估 + 判定依据 + 下次优化点；S8 用各话题预估平均作为"本次练习训练预估"。

- [x] **#2 判定依据 + 下次优化点（S6）**
  - 原型：S6"为什么是 X 分"判定依据 + "下次尝试优化" 1-2 点。
  - 当前：判定依据缺失；下次优化点是裸破折号 TODO。
  - 位置：`src/components/practice/topic-summary.tsx:70`。
  - ✅ 已修复：`topic-summary.tsx` 渲染 `summaryBasis`（判定依据）与 `nextFocus`（下次优化点）。

- [x] **#3 录音音频录制/回放**
  - 原型：S6 每题、历史、复盘均有"原始录音"可播放；PRD FR-03 要求保存录音。
  - 当前：完全无 MediaRecorder，只有 Web Speech API 文字转写，无音频 blob、无回放。
  - 位置：全 `src/`。
  - ✅ 已修复（按用户决策，本地存储）：`MediaRecorder` 采集 → Blob 存 IndexedDB（`src/lib/local-audio.ts`）→ S5/S6 用 `<audio>` 回放；会话内与同设备跨会话可回放，不落库。

- [x] **#4 语法/句子结构/自然改写（复盘详情）**
  - 原型：PRD 明确"语法/结构/自然改写仅在复盘详情出现"，S5/实时区不出现。
  - 当前：`RoundRecord.grammarNotes/naturalRewrite` 恒空串；`/api/response-feedback` 不返回它们；S5"语法+改写"区永不渲染。
  - 位置：`src/components/practice/ai-coach-session.tsx:173-175`、`:449-472`、`src/app/api/response-feedback/route.ts`。
  - ✅ 已修复：新增 `POST /api/grammar-feedback`（`getGrammarRewritePrompt`）+ `POST /api/response-feedback` 流式推荐回答并行；`grammarNotes/naturalRewrite` 回填 RoundRecord，S5 与 S6 逐题均渲染。

- [x] **#5 会话持久化（AI 教练流程）**
  - 原型：记录 = 录音/最终转写/实时片段（带时间戳）/黄色标记事件/推荐回答/反馈；进历史。
  - 当前：AI 教练结束页显示"本次练习已保存"但全程不写 `/api/sessions`，"已保存"与事实不符；progress 看不到主流程练习。
  - 位置：`src/components/practice/ai-coach-session.tsx`（全文件无 sessions 调用）。
  - ✅ 已修复：每答完一题异步 `POST /api/sessions`（`mode:"train"` + `feedback` jsonb 存推荐/词汇/语法/改写）；schema 新增 `feedback` 列 + 迁移 `0003`；progress 可见 AI 教练记录。

- [x] **#6 下一话题确认弹窗**
  - 原型：S6"进入下一话题"→ 大确认弹窗（预览下一话题+"从第 1 问开始"+ 返回/结束/开始三操作 + 焦点管理 + Escape）。
  - 当前：直接 `router.push("/bank")`（TODO）。
  - 位置：`src/components/practice/ai-coach-session.tsx:510`。
  - ✅ 已修复：S6"进入下一话题"→ `getNextTopic(topic)`（`bank.ts` 新增）→ 确认弹窗（三操作 + 聚焦主按钮 + Escape + 点击遮罩关闭），确认后会话内切换到下一话题第 1 问。

- [x] **#7 S7/S8 结束页分支**
  - 原型：按已完成话题数分支 —— 1 个话题 → S7 简洁确认（不重复预估/逐题内容）；≥2 个话题 → S8 跨话题总评 + 本次练习训练预估 + 已完成话题列表（每行进该话题总结）。
  - 当前：只有一个结束页，无分支、无跨话题总评、无话题列表。
  - 位置：`src/components/practice/ai-coach-session.tsx:518-560`。
  - ✅ 已修复：`sessionTopics.length <=1` → S7 简洁确认；`>=2` → S8（会话预估 + 跨话题下次优化点聚合 + 已完成话题列表，点击回看该话题 S6）。

- [x] **#9 针对性追问第 4 问**
  - 原型：信息不足时最多追加一问针对性追问（最多 4 问）；第三问（或可选第四问）主操作="完成话题练习"。
  - 当前：固定 3 问；`follow-up` 返回的 `fallback` 标志被忽略。
  - 位置：`src/components/practice/ai-coach-session.tsx:135-139`。
  - ✅ 已修复：第 3 问回答 < 20 词且未用过追问 → S5 主按钮"针对性追问"进入第 4 问；否则"完成话题练习"。

---

## P2 · 结构与信息架构

- [ ] **#10 Part 2/3 锁定**：原型 Part 2/3 "暂未开放、不可进入"；当前 bank Part 筛选 1/2/3 均可选。位置：`bank-browser.tsx:198-218`。
- [ ] **#11 话题行缺历史训练次数副文案**："· N 次历史训练/尚未练习"（依赖 #15 话题级历史统计）。
- [ ] **#12 年份选择模型**：原型年份页签（2026–2020）+"当季新题/历年题目"；当前"分类（real/predicted）"下拉。predicted ≈ 2026 当季。
- [ ] **#13 诊断 8 题结构**：原型 = 设目标分 → 选 2 话题 → 8 题（每话题 4 问，仅 Part 1，约 4-5 分钟）；当前 = Part1/2/3 各 1 题共 3 题。位置：`onboarding-flow.tsx`。
- [ ] **#14 诊断中途退出保存进度**：原型"保存并离开"保留进度、不生成正式水平。
- [ ] **#15 历史按话题分组 + 筛选 + 删除**：原型历史 = 话题分组、按最近练习时间新到旧、年份+当季筛选、打开话题→话题复盘、可"重新练习这个话题"、可删除（级联）。当前按单条会话平铺 + 趋势图，无话题分组/筛选/话题复盘/删除。位置：`progress/progress-panel.tsx`。且 AI 教练不写历史（#5），主流程练习在 progress 看不到。
- [ ] **#16 目标与训练阶段页（S10）**：原型"当前水平（只读）/ 当前训练目标（可改）/ 阶段路径 / 保存训练目标"；当前无目标页，导航为 题库/素材库/进度/设置。位置：`top-nav.tsx:18-23`。
- [ ] **#17 全局壳**：顶栏缺"文字教官"状态徽标；缺"当前学习计划"卡（当前水平/训练目标/最终目标）；无全局 aria-live 播报。
- [ ] **#18 S4 词汇建议条**：录音中"词汇建议：X 可替换为 Y"；当前只有标黄转写。
- [ ] **#19 S3 元信息缺年份/Part**。
- [ ] **#20 埋点事件全无**（PRD §10，19 个事件）。
- [ ] **#21 保存数据缺音频/实时片段/黄色标记事件**（FR-03）。

---

## 已对齐（无需改动）

- S5/S6 词汇联动（悬停瞬态 + 点击固定）—— 已补全。
- S5 推荐回答流式（除 #8 JSON 外壳）。
- 话题总结结构（转录稿/推荐回答/词汇汇总）。
- onboarding 诊断结果页（四维 + 阶段路径）。
- 题库按话题进练习。
- 五层目标级回答流程。
- 框架素材库（缺 stories 编辑，属已知简化）。
- 设置页（语言 / ASR / AI 服务）。

## 顺带：死代码/占位（可清理）

`saving` phase 死代码；`error` state 死 UI；`TopicRow`/`emptyProfile`/`updateOverallBand`/`getSingleResponseFeedbackPrompt`/`Spinner` 无引用；`framework` stories 无编辑入口。

---

## 建议实施顺序

1. **P0**：#8 SSE JSON 外壳（一行修复）。
2. **P1**：#5 会话持久化（数据模型先行）→ #1+#2 训练预估/判定依据 → #4 语法/改写 → #3 录音回放 → #6 下一话题弹窗 → #7 S7/S8 分支 → #9 针对性追问。
3. **P2**：#15 历史重构（依赖 #5）→ #16 目标页 → #10/#11/#12 bank → #13/#14 诊断 → #17 全局壳 → #18/#19 S4/S3 细节 → #20/#21 数据与埋点。
