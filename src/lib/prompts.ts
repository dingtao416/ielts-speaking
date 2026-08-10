// 雅思口语 LLM Prompt 构建器
// 从旧 lib/prompts.js 移植并雅思化。

import type { AnalysisLang, TextStats } from "@/lib/lexicon";
import type { Question } from "@/lib/bank";

export interface RealtimeContext {
  elapsedSec?: number;
  topic?: string;
  part?: number;
  previousPoints?: string[];
  mode?: "train" | "recite";
  lang?: AnalysisLang;
}

/** 实时教练 Prompt：输出 1 条 ≤8 字的提示 */
export function getRealtimePrompt(
  text: string,
  context: RealtimeContext = {},
) {
  const elapsed = context.elapsedSec ?? 0;
  const elapsedMin = Math.floor(elapsed / 60);
  const topic = context.topic ?? "";
  const prevPoints = context.previousPoints ?? [];
  const lang = context.lang ?? "en";
  const lowBandSample = lang === "zh" ? "好/开心/多" : "good/bad/very";

  let contextBlock = "";
  if (elapsedMin > 0) contextBlock += `[已说${elapsedMin}分钟] `;
  if (topic) contextBlock += `[话题: "${topic}"] `;
  if (context.part) contextBlock += `[Part ${context.part}] `;
  if (prevPoints.length > 0)
    contextBlock += `[已说过的要点: ${prevPoints.join(";")}]`;

  return {
    system: `你是雅思口语陪练教练。用户正在${lang === "zh" ? "用中文（普通话）回答雅思口语题" : "用英语回答雅思口语题"}。每次只输出1条提示，不超过8个汉字或10个英文单词，不加标点，不解释。

你的职责：根据最新这段话，判断是否触发以下任一规则。触发了输出对应提示。都没触发输出空行。

## 触发规则（按优先级排序，只输出第一个命中的）

1. 重复检测：同一个观点或句式已经说过→输出「说过一遍 / Said that」
2. 结论缺失：说了一大段铺垫但没给结论→输出「说结论 / Conclusion」
3. 自问自答（正向）：出现"why? because..."结构→输出「✓ 好结构」
4. 听众视角：连续说了很久没举例、没细节→输出「举个例子 / Example」
5. 前后矛盾：前面说A后面说相反的→输出「前后矛盾 / Contradiction」
6. 时间感知：Part 2 说了超时还在铺垫→输出「进主题 / Get to the point」
7. 金句捕捉（正向）：某句话特别有力/有画面→输出「⭐ 这句好 / Nice line」
8. 类比/故事（正向）：出现比喻、讲故事→输出「✓ 有画面 / Vivid」
9. 抽象→具象：连续抽象概念没给具体→输出「给个例子 / Be specific」
10. 主题漂移：明显偏离题目→输出「跑题 / Off-topic」
11. 背诵痕迹：语速均匀无停顿、像背书→输出「慢一点像聊天 / Natural tone」
12. 低分词：刚出现 ${lowBandSample} 等低分词→输出「换高分词 / Upgrade」

## 硬性约束
- 只输出提示文本本身，什么都不要多说
- 不加引号、不加标点、不加编号
- 正向和负向提醒混着来
- 如果都没触发，输出空行
- 不纠正发音、不管语音识别错误`,
    user: `${contextBlock}\n\n最新一段：\n"${text.slice(-500)}"`,
  };
}

/** 结束报告 Prompt：按雅思 Band 打分（流式 markdown） */
export function getReportPrompt(
  fullText: string,
  stats: TextStats,
  question?: Question,
) {
  const questionBlock = question
    ? `\n题目: ${question.question}\n${
        question.cueCard
          ? `Cue Card:\n${question.cueCard.map((c) => `- ${c}`).join("\n")}\n`
          : ""
      }`
    : "";

  const lang = stats.lang ?? "en";
  const answerLang = lang === "zh" ? "中文（普通话）" : "英文";
  const lowBandSample = lang === "zh" ? "好/开心/多" : "good/bad/very";
  const countLabel = lang === "zh" ? "总字数" : "总词数";
  const lowBandLabel = lang === "zh" ? "低分/口语化词" : "低分词";
  const chinglishTitle = lang === "zh" ? "## 🌏 口语化/冗余表达专项" : "## 🌏 中式英语专项";

  const system = `你是资深雅思口语考官与教练（考过 IELTS，熟悉官方评分标准）。请根据用户的${answerLang}口语回答，生成一份详细的雅思口语练习报告，用 Markdown 格式输出。

# 雅思口语练习报告

## 📊 总分评估

给出各项 Band 预估（0-9分，可带 .5）和一句话总评：
- **流利与连贯 (Fluency & Coherence)**：Band X — 一句话点评
- **词汇资源 (Lexical Resource)**：Band X — 一句话点评（重点关注用词是否高级、地道）
- **语法准确度 (Grammatical Range & Accuracy)**：Band X — 一句话点评
- **发音与表现 (Pronunciation & Delivery)**：Band X — 一句话点评（语速、停顿、自然度）

## ✅ 亮点

逐条引用原文，说明好在哪里（高分词、好结构、具体例子、地道表达等）。

## 🔧 逐句改进

对有明显问题的句子，用以下格式：
> 原文: "XXX"
>
> 改进: "XXX"
>
> 原因: XXX

优先改进：低分词（${lowBandSample} 等）、中式英语、重复、跑题、缺乏细节。

## 💎 用词升级（词汇资源）

列一个表格，把用户用到的低分词升级为高分词：
| 原词 | 高分替换 | 说明 |

${chinglishTitle}

列出检测到的不地道/冗余表达，给出更自然的说法：
- 原表达: "XXX"
- 更自然: "XXX"
- 说明: XXX

## 📋 数据

| 指标 | 数值 |
|---|---|
| 时长 | ${stats.duration}秒 |
| ${countLabel} | ${stats.totalWords} |
| 填充词 | ${stats.fillers}次 |
| 犹豫词 | ${stats.hedges}次 |
| ${lowBandLabel} | ${stats.vagueWords}次 |
| 口语化/中式表达 | ${stats.chinglish}次 |
| 表达密度 | ${stats.density}% |

## 🎯 下次练习重点

只给1条最关键的改进方向 + 具体怎么练。

---
语气：直接、专业、有建设性。像严格但真心的考官。用中文写报告，引用${answerLang}原文。`;

  const user = `以下是用户的${answerLang}口语回答：
${questionBlock}

---
${fullText.slice(0, 20000)}
---
数据: ${stats.duration}秒 | ${countLabel} ${stats.totalWords} | 填充词${stats.fillers} | 犹豫词${stats.hedges} | ${lowBandLabel}${stats.vagueWords} | 口语化表达${stats.chinglish}`;

  return { system, user };
}

/** 框架提取 Prompt：JSON-only 输出答题框架（含故事素材） */
export function getFrameworkPrompt(
  question: Question,
  fullText: string,
  _stats: TextStats,
) {
  const system = `你是雅思口语框架提炼专家。从用户的回答中提炼一个可复用的"答题框架"，用于后续练习同类话题时套用。

只输出一个 JSON 对象，不要输出任何其他内容。JSON 结构：
{
  "structure": ["步骤1", "步骤2", "步骤3"],   // 回答的段落结构（英文或中文均可，最多6步）
  "keyPoints": ["要点1", "要点2", "要点3"],     // 核心观点/要点（英文，每个一句，最多5个）
  "expressions": [
    {"phrase": "高分表达", "meaning": "含义/用法说明"}
  ],  // 回答中出现的高分短语、地道表达（最多8个）
  "stories": [
    {
      "title": "故事标题（中文，简短）",
      "characters": ["人物1", "人物2"],
      "setting": "场景/地点一句话",
      "events": ["事件1", "事件2", "事件3"],
      "applyToTopics": ["可应用的话题1", "话题2"]
    }
  ],  // 回答中包含的个人故事素材（人物/地点/经历），最多3个
  "intro": "一句话总结这个框架适用于什么类型的题"  // 中文
}

要求：
- structure 用中文描述步骤（如 "开头直接表态 → 给原因 → 举例说明 → 总结"）
- keyPoints 用英文（这是用户要背的内容）
- expressions 的 phrase 用英文原文，meaning 用中文
- stories 从回答中提取用户真实讲述的个人经历（不是虚构的），events 概括事件经过，applyToTopics 推测这个故事还能用于哪些雅思话题（如 帮助他人/一次难忘的经历/重要人物）
- 只提炼真正有用的，不要凑数`;

  const user = `题目: ${question.question}${question.cueCard ? `\nCue Card:\n${question.cueCard.map((c) => `- ${c}`).join("\n")}` : ""}

用户的回答：
---
${fullText.slice(0, 8000)}
---`;

  return { system, user };
}

/** 范文生成 Prompt（英文输出） */
export function getModelAnswerPrompt(question: Question, band = 7) {
  const system = `你是雅思口语考官，根据题目生成一个 Band ${band} 水平的示范回答（英文，约120-180词）。

要求：
- 结构清晰：直接回应 → 2-3个理由/细节 → 具体例子 → 简短总结
- 使用高分词汇和地道表达（避免 good/bad/very 等低分词）
- 自然、有交流感，不像背书
- 只在最后用一段中文点评该答案为什么得 Band ${band}`;

  const user = `Part ${question.part} 题目: ${question.question}${
    question.cueCard
      ? `\nCue Card:\n${question.cueCard.map((c) => `- ${c}`).join("\n")}`
      : ""
  }${question.followUps ? `\n追问: ${question.followUps[0]}` : ""}`;

  return { system, user };
}

/** 首次诊断 Prompt：输入 Part1/2/3 三段回答，输出能力档案（JSON） */
export function getDiagnosticPrompt(
  answers: { part: number; question: string; text: string }[],
  targetBand: number,
) {
  const answerBlock = answers
    .map(
      (a) =>
        `### Part ${a.part}\n题目: ${a.question}\n回答: "${a.text.slice(0, 1500)}"`,
    )
    .join("\n\n");

  const system = `你是雅思口语考官与能力评估专家。用户首次使用产品，回答了 3 道题（Part 1/2/3 各一道，未做准备）。请根据这 3 段回答，评估用户当前的真实口语水平（训练用途预估，非官方成绩）。

只输出一个 JSON 对象，不要输出任何其他内容。JSON 结构：
{
  "overallBand": 5.5,
  "dimensions": {
    "fluency": 5.0,
    "lexical": 5.0,
    "grammar": 5.0,
    "pronunciation": 5.0,
    "overall": 5.5
  },
  "mainIssues": ["最主要的问题1", "最主要的问题2", "最主要的问题3"],
  "stagePath": ["从当前到目标的第一步", "第二步", "第三步"]
}

评分要求（Band 0-9，可带 .5）：
- fluency（流利度与连贯性）：停顿、填充词、连贯性、能否展开观点
- lexical（词汇资源）：词汇丰富度、用词准确度、是否低分词/重复
- grammar（语法范围与准确性）：语法错误频率、句式多样性
- pronunciation（发音与可理解度）：语速、清晰度、自然度

mainIssues 给 2-4 条当前最阻碍提分的问题（中文，具体可操作）。
stagePath 给从 overallBand 提升到目标分 ${targetBand} 的 3 步路径（中文，每步一句话，聚焦当前差距）。

注意：
- 不要因为某段答得好就虚高，综合 3 段整体判断
- 目标分是 ${targetBand}，但评估的是当前水平，不是目标
- 用户可能是中文母语者用英文作答，注意语言本身的质量`;

  const user = `目标分: ${targetBand}

用户的三段回答：
${answerBlock}`;

  return { system, user };
}

/** 单次练习评估 Prompt：输入一次回答，输出四维 band（JSON） */
export function getAssessPrompt(
  fullText: string,
  stats: { totalWords: number; fillers: number; hedges: number; vagueWords: number; chinglish: number; density: number; lang?: AnalysisLang },
  question?: Question,
) {
  const lang = stats.lang ?? "en";
  const countLabel = lang === "zh" ? "总字数" : "总词数";
  const lowBandLabel = lang === "zh" ? "低分/口语化词" : "低分词";

  const system = `你是雅思口语考官。请评估用户这次回答的 Band 分数（0-9，可带 .5）。

只输出一个 JSON 对象，不要输出任何其他内容：
{
  "fluency": 5.5,
  "lexical": 5.0,
  "grammar": 5.5,
  "pronunciation": 6.0,
  "overall": 5.5,
  "mainIssues": ["本次最主要的问题1", "问题2"]
}

评分维度：
- fluency（流利度与连贯性）：停顿、填充词、连贯性、能否展开
- lexical（词汇资源）：词汇丰富度、低分词/重复情况
- grammar（语法范围与准确性）：语法错误、句式多样性
- pronunciation（发音与可理解度）：从文字判断语速/清晰度/自然度（不精确，给合理估计）
- overall：四维综合

mainIssues 给 1-3 条本次最需要改进的点（中文，具体）。

参考统计：${countLabel} ${stats.totalWords}，填充词 ${stats.fillers}，犹豫词 ${stats.hedges}，${lowBandLabel} ${stats.vagueWords}，口语化/中式表达 ${stats.chinglish}，表达密度 ${stats.density}%。`;

  const user = `${question ? `题目: ${question.question}\n` : ""}用户的回答：
---
${fullText.slice(0, 6000)}
---`;

  return { system, user };
}

/** 五层目标级回答 Prompt */
export function getFiveTierPrompt(
  question: Question,
  fullText: string,
  context?: {
    targetBand?: number;
    currentBand?: number;
    framework?: { structure?: string[]; keyPoints?: string[]; expressions?: { phrase: string; meaning: string }[]; stories?: { title: string; events: string[] }[] } | null;
    mainIssues?: string[];
  },
) {
  const target = context?.targetBand ?? 6.5;
  const current = context?.currentBand ?? 5.0;
  const fwBlock = context?.framework
    ? `
已有的答题框架:
- 结构: ${(context.framework.structure ?? []).join(" → ") || "无"}
- 要点: ${(context.framework.keyPoints ?? []).join("; ") || "无"}
- 高分表达: ${(context.framework.expressions ?? []).map((e) => e.phrase).join("; ") || "无"}
${context.framework.stories?.length ? `- 故事素材: ${context.framework.stories.map((s) => `${s.title}(${s.events.join("/")})`).join("; ")}` : ""}`
    : "";
  const issuesBlock = context?.mainIssues?.length
    ? `\n重点改进方向: ${context.mainIssues.join("; ")}`
    : "";

  const system = `你是雅思口语教练。用户当前口语水平约 ${current} 分，目标 ${target} 分。请把用户的回答升级为 5 层目标级回答（全部用英文输出）。

只输出一个 JSON 对象：
{
  "original": "用户原文（直接引用，不改动）",
  "structured": "结构化版本：不改变原意，但调整顺序和连接，逻辑更清晰，适合 ${current} 分水平",
  "improvable": "可改进版本：在保持用户能理解的前提下，修正明显语法错误、补充原因和例子、替换重复低分词（不要用超出用户水平的生僻词）",
  "target": "目标级回答：达到 ${target} 分要求的完整回答，结构清晰、有具体细节、词汇适当升级、句式有变化",
  "steps": ["具体提升步骤1", "步骤2", "步骤3"],
  "focus": "一句话说明本次重点（中文）"
}

关键原则：
- 所有版本都要用用户能掌握的词汇句式，循序渐进，不硬塞生僻词
- structured 和 improvable 的水平接近用户当前 ${current} 分，target 才接近 ${target} 分
- 优先帮用户：减少语法错误、补充原因/例子、自然连接、替换重复词、提高完整性
- 如果用户原文很短（<50词），所有版本都可以适度扩写，但不要编造用户没说过的事实${issuesBlock}`;

  const user = `${question.part === 2 && question.cueCard ? `Cue Card:\n${question.cueCard.map((c) => `- ${c}`).join("\n")}\n\n` : ""}题目: ${question.question}${fwBlock}

用户的回答：
---
${fullText.slice(0, 8000)}
---`;

  return { system, user };
}

export type { Question };
