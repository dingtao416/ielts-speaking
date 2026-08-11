# UI/UX 设计评审清单

> 评审范围：全站（设计 token / 导航 / 首页 / 题库 / AI 教练 S3–S8 / 进度 / onboarding / 认证 / 素材库）。
> 标准：以「产品一致性 + 无障碍 + 信息架构 + 语义克制」为最严格基准。
> 评审日期：2026-08-11。每条附代码位置与建议。

## 优先级定义

- **P0**：基础系统性问题——全站范围、影响正确性/无障碍/信息架构，用户每天会碰到，优先修。
- **P1**：一致性 & 体验——跨页面体验不统一或违背克制原则，中等工作量。
- **P2**：细节打磨——单点问题，低成本高感知。

---

## P0 · 基础系统性问题

- [x] **#1 按钮系统分裂——全站 4+ 种"主按钮"**
  - `Button` 组件（`src/components/ui/button.tsx`）未被全站采用：首页 CTA（`src/app/page.tsx:50-62`）、onboarding（`src/components/onboarding/onboarding-flow.tsx:124-131,203-231,332-339`）、进度页（`src/components/progress/progress-panel.tsx:250-255,300-305`）均为手写。
  - 不一致点：圆角/高度/按压反馈/disabled 态——onboarding 用 `disabled:opacity-40`，Button 用 `disabled:opacity-50`（button.tsx:54）；auth 页另有一整套 CSS class `.primary-button`（globals.css:272）。
  - 建议：全站收敛到 `Button` 组件；废弃 `.primary-button` 等 CSS 手写按钮；禁用态/loading 只定义一处。
  - ✅ 已修复：button.tsx 抽出 `buttonClass(variant,size)` 供 `Button` 与「链接按钮」共用；首页/onboarding/进度页/素材库/顶栏登录/AI教练结束页 等手写按钮全部统一；danger 变体改用 `--danger-color`。auth 页 `.primary-button` 为内部自成体系的遗留，暂未迁移。

- [x] **#2 语义颜色冲突：红色既是"填充词"又是"错误"**
  - `--filler-color: #dc2626`（globals.css:13）同时用于：字幕"填充词"高亮（`.hl-filler`）、麦克风/网络错误提示（`speech-answer-card.tsx:130`、`practice-session.tsx:572`）、danger 按钮（button.tsx:17）。
  - "说了个 um" 与 "出错了" 同色：轻微高频问题被放大，真正错误被轻视。
  - 建议：错误/危险与词汇高亮各用独立语义色；填充词降级为弱化色（对齐 PRD"实时区只保留黄色词汇"）。
  - ✅ 已修复：新增 `--danger-color`（错误/危险）、`--recording-color`（录音状态）；填充词改琥珀色 `--filler-color`；错误盒子/危险按钮/删除 hover/llm 失败全部迁到 danger，录音红点/文字迁到 recording，填充词只留字幕与统计。

- [x] **#3 深色模式半残**
  - `prefers-color-scheme: dark` 只覆盖 bg/fg/muted/border/文字（globals.css:19-29）；`--vague-color #a16207`、`--filler-color`、`hl-grammar #b91c1c`、`hl-good #16a34a` 硬编码色深色下不变量、对比不足；auth 输入 focus `rgba(0,0,0,0.08)`（globals.css:245）深色下不可见；高亮词 hover 浅黄底（rgb 243 214 95 / 35%）深色突兀。
  - 建议：功能色全部进 token 并在深色块重定义；focus 用前景色或 `color-mix`。
  - ✅ 已修复：功能色（filler/hedge/vague/chinglish/grammar/good/danger/recording）全部进 token 并补齐深色变体；`hl-grammar/hl-good` 改用 token；auth focus 改用 `--focus-ring`；高亮词 hover/focus 用 `color-mix`。

- [x] **#4 辅助文字对比度不达标（无障碍硬伤）**
  - `--tertiary-text: #999999`（globals.css:9）在 `#fff` 上 ≈3.0:1（WCAG AA 需 4.5:1）；深色 `#737373` 同样不达标。`text-tertiary-text` 全站用于提示/时间戳/副标题。
  - 建议：浅色到 `#757575` 以上，深色到 `#a1a1a1` 以上。
  - ✅ 已修复：浅色 `#999999 → #757575`（≈4.6:1），深色 `#737373 → #a1a1a1`。

- [x] **#5 信息架构：双 CTA 同向、"练习"非一级入口**
  - 首页"浏览题目/开始练习"**都跳 `/bank`**（`src/app/page.tsx:49-62`）；顶栏导航 题库/素材库/进度/设置（top-nav.tsx:18-23）无"练习"入口；`/bank` 与 `/library` 同用 BookOpenText 图标（top-nav.tsx:19-20）。
  - 建议：设唯一"开始练习"主入口；题库回归"选话题→开始练习"旅程；区分/换用导航图标。
  - ✅ 已修复：首页主 CTA"开始练习"→`/bank`、次 CTA"查看训练进度"→`/progress`（不再同向）；导航 `/library` 改用 `BookMarked` 图标，与 `/bank` 的 `BookOpenText` 区分。

- [x] **#6 显示与行为不符：Part 2/3 可选但练习全进 Part 1 教练流程**
  - `bank-browser` Part 筛选允许 1/2/3（bank-browser.tsx:12,207-219），但 `practiceHref` 无条件跳 `/practice/topic/{topic}`（bank-browser.tsx:66-69）——那是 Part-1-only 的 AI 逐题流程。用户点 Part 2 题的"练习"进的是 Part 1 流程。
  - 建议：按原型锁定 Part 2/3（"暂未开放"）或按 part 分路由。
  - ✅ 已修复：Part 筛选选 2/3 时显示"暂未开放"提示、不渲染题目列表；混合列表里非 Part 1 题目的"练习"按钮替换为"暂未开放"锁定标签（背记入口保留）。

---

## P1 · 一致性 & 体验

- [x] **#7 字幕高亮 5 色齐放，违背 PRD"实时区克制"**
  - `hl-filler/hedge/vague/chinglish/grammar` 五色（globals.css:78-112），`practice-session` 实时字幕全量上（practice-session.tsx:495）。PRD 要求实时区只显示转写 + 黄色词汇。
  - 建议：实时层收敛到黄色词汇（`highlightVagueOnly` 已实现）；5 色分析只用于复盘/详情。
  - ✅ 已修复：`practice-session` 实时字幕（句子 + 即时）改用 `highlightVagueOnly`，只标黄色词汇；5 色分析保留在统计面板与教练提示。

- [x] **#8 训练目标未可视化**
  - S5 全页无 `stageBand` 显示，推荐回答"按 X 分生成"无从感知。
  - 建议：S5 顶部加"当前训练目标 X"徽标，推荐回答块标注难度档。
  - ✅ 已修复：S5 顶部加"当前训练目标 X.X"徽标；推荐回答面板下加"按 X 分训练目标调整表达"说明。

- [x] **#9 "处理中"有三种语言**
  - Button 内建 `Loader2 spin`；onboarding 用 `Sparkles animate-pulse`（onboarding-flow.tsx:211）；AI 教练用文字"生成中…"（`aiCoach.generating`）。
  - 建议：统一一种 loading 视觉。
  - ✅ 已修复：onboarding 改用 Button `loading`（内建 Loader2）；ai-coach 语法生成占位与 practice-session 框架提取补 Loader2；全站"处理中"统一为 Loader2 + 文案。

- [x] **#10 原生 `<audio>` 控件突兀**
  - S5/S6 直接 `render <audio controls>`（ai-coach-session.tsx、topic-summary.tsx），浏览器原生控制条与极简设计冲突。
  - 建议：包一层自绘播放条（播放/暂停 + 进度 + 时长），对齐卡片风格与无障碍。
  - ✅ 已修复：新增 `src/components/ui/audio-playback.tsx`（自绘播放/暂停 + 进度 + 时长，带 `aria-label`），S5 与 S6 逐题均替换原生控件。

- [x] **#11 Modal 行为不一致**
  - 下一话题弹窗有 focus + Escape；进度报告弹窗（progress-panel.tsx:352-377）无初始 focus、无 focus trap、无 Escape、无 `role="dialog"` 语义。
  - 建议：抽共享 Modal 组件，统一 backdrop/focus/Escape/语义。
  - ✅ 已修复：新增 `src/components/ui/modal.tsx`（`role="dialog"` + 初始焦点 `data-autofocus` + Tab 焦点陷阱 + Escape + 点击遮罩关闭）；进度报告弹窗与下一话题弹窗均改用共享 Modal。

- [x] **#12 进度趋势图判定过严 + 四维条固定宽**
  - `band-trend-chart.tsx:73`：< 2 个点直接渲染空，1 条记录时仍显示"暂无数据"；四维条 `w-40` 固定（progress-panel.tsx:202、onboarding-flow.tsx:291）小屏拥挤。
  - 建议：1 个点也绘制；条改 `flex-1` 自适应。
  - ✅ 已修复：趋势图去掉 `<2` 早退，单点也渲染（网格 + 端点 + 悬浮提示）；四维条 `w-40 → flex-1`。

- [x] **#13 S4 麦克风错误静默退回**
  - `ai-coach-session.tsx`：录音中 `speech.error` → 直接 `setPhase("question")`，无解释。
  - 建议：S3 展示错误 + 重新授权指引（复用 `speechErrorMessageKey`）。
  - ✅ 已修复：S3 展示麦克风错误（`role="alert"` + `speechErrorMessageKey` 本地化文案）+ 重试按钮。

- [x] **#14 S5 "已保存"确认感太弱**
  - `{t("aiCoach.saved")} ✓` 是灰色小字，主流程里程碑不如推荐回答显眼。
  - 建议：明确保存态（绿勾 + 稍重样式）或 toast。
  - ✅ 已修复：改绿色勾 + `font-medium` 确认态，与训练目标徽标同行。

- [x] **#15 题库筛选视觉同权**
  - 分类/年份/话题/Part 四组控件同款 pill、同色态，无主次、无层级指示。
  - 建议：年份作主维度，话题/Part 弱化；加当前层级指示（breadcrumb/阶梯式弱化）。
  - ✅ 已修复：新增"当前选择"面包屑（分类 / 年份 / 话题 / Part，带 aria-label），实时反映所在层级；年份按钮保持主维度尺寸，话题/Part 弱化。

---

## P2 · 细节打磨

- [x] **#16 移动端顶栏拥挤**
  - `< sm` 时 4 个导航 label 隐藏（top-nav.tsx:54），375px 上品牌+4 图标+语言+头像约 7-8 元素，两个 BookOpenText 图标重复。
  - 建议：移动端导航降级为抽屉，或合并语言切换进设置。
  - ✅ 已修复：`< sm` 折叠为汉堡菜单（图标 + label，带 aria-expanded/关闭），桌面保持内联；右侧只留 语言 + 头像/退出 + 汉堡。

- [x] **#17 品牌名不统一**
  - 顶栏 `t("brand.name")` vs 页脚硬编码 "IELTS Speaking Trainer"（app-shell.tsx:18）。
  - 建议：统一品牌名常量。
  - ✅ 已修复：页脚改用 `t("brand.name")`（跟随界面语言）。

- [x] **#18 圆角/内边距系统混乱**
  - `rounded-2xl/xl/lg`、`p-6/5/4/3.5` 混用；同类卡片间距不一致（bank `p-5`、progress 行 `p-3.5`、practice `p-6`）。
  - 建议：定 radius/spacing token 并约束组件只用 token。
  - ✅ 已修复（部分）：globals.css 记录设计尺度（圆角 2xl/xl/lg、内边距 section p-6 / 列表项 p-5）；全站 section 卡片统一 `p-6`（bank 题卡、AI 教练 S5 卡）。完整 token 化约束为后续跟进。

- [x] **#19 进度历史行信息过载**
  - 每行塞模式徽标 + topic + 60 字截断转录 + 时长 + 日期 + band + 报告按钮（progress-panel.tsx:314-343）；AI 教练新记录全无 band，整列"—"。
  - 建议：行内只留 topic+时间+评分；详情进展开/弹层；无 band 不渲染列。
  - ✅ 已修复：行改为两行结构——首行 模式/topic/日期/评分徽标(仅当有)/报告按钮，转录稿独立第二行 `line-clamp-2`；去掉时长与无 band 的"—"列。

- [x] **#20 无障碍语义缺失**
  - 四维进度条裸 `div`（无 `role="progressbar"`/`aria-valuenow`）；倒计时纯文本无 `aria-live`。
  - 建议：补语义属性；倒计时加 `aria-live`。
  - ✅ 已修复：四维进度条加 `role="progressbar"` + `aria-valuemin/max/now` + `aria-label`（progress 页与 onboarding 结果页）；录音倒计时加 `role="timer"` + "剩余 X 秒" `aria-label`。

---

## 一句话总评

底子不差但"系统未收敛"：设计 token 已有，但组件层（按钮/卡片/弹窗/loading/音频）各写各的；语义色与层级（红=错误 vs 红=填充词、5 色字幕）违背 PRD 克制原则；深色模式与对比度是硬伤。建议按 P0 顺序修：**#1 按钮统一 → #2 语义色 → #3 深色 → #4 对比度 → #5 信息架构 → #6 Part 入口**——这些是用户每天碰到、收益最大的项。
