// 雅思口语 LLM Prompt 构建器
// 从旧 lib/prompts.js 移植并雅思化。

import type { TextStats } from "@/lib/lexicon";
import type { Question } from "@/lib/bank";

export interface RealtimeContext {
  elapsedSec?: number;
  topic?: string;
  part?: number;
  previousPoints?: string[];
  mode?: "train" | "recite";
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

  let contextBlock = "";
  if (elapsedMin > 0) contextBlock += `[已说${elapsedMin}分钟] `;
  if (topic) contextBlock += `[话题: "${topic}"] `;
  if (context.part) contextBlock += `[Part ${context.part}] `;
  if (prevPoints.length > 0)
    contextBlock += `[已说过的要点: ${prevPoints.join(";")}]`;

  return {
    system: `你是雅思口语陪练教练。用户在用英语回答雅思口语题。每次只输出1条提示，不超过8个汉字或10个英文单词，不加标点，不解释。

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
12. 低分词：刚出现 good/bad/very 等低分词→输出「换高分词 / Upgrade」

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

  const system = `你是资深雅思口语考官与教练（考过 IELTS，熟悉官方评分标准）。请根据用户的英文口语回答，生成一份详细的雅思口语练习报告，用 Markdown 格式输出。

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

优先改进：低分词（good/bad/very 等）、中式英语、重复、跑题、缺乏细节。

## 💎 用词升级（词汇资源）

列一个表格，把用户用到的低分词升级为高分词：
| 原词 | 高分替换 | 说明 |

## 🌏 地道度专项（中式英语）

列出检测到的中式英语/不地道表达，给出更自然的英文：
- 中式表达: "XXX"
- 更地道: "XXX"
- 说明: XXX

## 📋 数据

| 指标 | 数值 |
|---|---|
| 时长 | ${stats.duration}秒 |
| 总词数 | ${stats.totalWords} |
| 填充词 | ${stats.fillers}次 |
| 犹豫词 | ${stats.hedges}次 |
| 低分词 | ${stats.vagueWords}次 |
| 中式英语 | ${stats.chinglish}次 |
| 表达密度 | ${stats.density}% |

## 🎯 下次练习重点

只给1条最关键的改进方向 + 具体怎么练。

---
语气：直接、专业、有建设性。像严格但真心的考官。用中文写报告，引用英文原文。`;

  const user = `以下是用户的英文口语回答：
${questionBlock}

---
${fullText.slice(0, 20000)}
---
数据: ${stats.duration}秒 | ${stats.totalWords}词 | 填充词${stats.fillers} | 犹豫词${stats.hedges} | 低分词${stats.vagueWords} | 中式英语${stats.chinglish}`;

  return { system, user };
}

/** 框架提取 Prompt：JSON-only 输出答题框架 */
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
  "intro": "一句话总结这个框架适用于什么类型的题"  // 中文
}

要求：
- structure 用中文描述步骤（如 "开头直接表态 → 给原因 → 举例说明 → 总结"）
- keyPoints 用英文（这是用户要背的内容）
- expressions 的 phrase 用英文原文，meaning 用中文
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

export type { Question };
