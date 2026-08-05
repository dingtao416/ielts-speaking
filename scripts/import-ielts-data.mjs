// 从 C:\Users\zhang\ielts_data\json 导入雅思口语真题到项目题库。
// 用法: node scripts/import-ielts-data.mjs
// 输出: data/question-bank/real/index.json（替换旧的精选题库）
//       data/question-bank/predicted/index.json（保留 predicted + 合并 Mock 2026）

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = "C:/Users/zhang/ielts_data/json";
const REAL_OUT = join(root, "data", "question-bank", "real", "index.json");
const PRED_OUT = join(root, "data", "question-bank", "predicted", "index.json");

// collection 名 → 年份
function yearFromCollection(collection) {
  const m = String(collection || "").match(/20\d{2}/);
  if (m) return Number(m[0]);
  return null;
}

// 从 Part2 题面提取 topic（取 "Describe a/the/an X" 的核心名词短语）
const TOPIC_STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "that", "you", "should", "say",
  "your", "something", "someone", "somebody", "which", "who", "what", "when",
  "where", "and", "or", "to", "for", "from", "with", "about", "have", "has",
  "would", "like", "can", "could", "did", "do", "was", "were", "is", "are",
  "please", "talk", "also", "very", "really",
]);
// 形容词/修饰词（在核心名词前要跳过）
const TOPIC_ADJECTIVES = new Set([
  "new", "old", "favorite", "favourite", "interesting", "important", "unusual",
  "memorable", "special", "recent", "current", "great", "good", "bad",
  "popular", "difficult", "easy", "useful", "energetic", "historical",
  "fun", "enjoyable", "happy", "sad", "big", "small", "large", "beautiful",
  "nice", "wonderful", "amazing", "exciting", "challenging", "ordinary",
  "particular", "typical", "common", "similar", "different", "last", "first",
]);

function extractTopic(part2Text) {
  // 合并 P2 所有文本
  const text = part2Text.join(" ").trim();
  const lower = text.toLowerCase();

  // 模式1: "Describe a/the/an X" — 跳过形容词，抓核心名词短语
  const m1 = lower.match(/describe\s+(?:a|an|the)\s+(.+?)(?:\s+(?:that|who|which|where|when|you|and|you|is|are|was|were|has|have|had|would)\b|$)/i);
  if (m1) {
    const phrase = m1[1]
      .split(/\s+/)
      .filter((w) => !TOPIC_STOPWORDS.has(w) && !TOPIC_ADJECTIVES.has(w));
    if (phrase.length >= 1) {
      const core = phrase.slice(0, 2);
      // 去掉尾部的 / 或 , （如 "place/building"）
      return core
        .map((w) => w.replace(/[\/,].*$/, ""))
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }

  // 模式2: "Describe your X" — 取 X
  const m2 = lower.match(/describe\s+your\s+(.+?)(?:\s+(?:that|who|which|where|when|you|and)\b|$)/i);
  if (m2) {
    const phrase = m2[1].split(/\s+/).filter((w) => !TOPIC_STOPWORDS.has(w));
    if (phrase.length >= 1) {
      return phrase
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }

  // 模式3: "Describe something/someone that ..." — 从句里找第一个核心名词
  const m3 = lower.match(/describe\s+(?:something|someone|somebody)\s+(?:that|who|which)\s+(?:is|are|was|were|you)\s+(.+?)(?:\s+(?:that|who|which|where|when|you|and|is|are)\b|$)/i);
  if (m3) {
    const phrase = m3[1].split(/\s+/).filter((w) => !TOPIC_STOPWORDS.has(w) && !TOPIC_ADJECTIVES.has(w));
    if (phrase.length >= 1) {
      return phrase
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }

  // 兜底：取前 2 个有意义的词
  const words = text.split(/\s+/).filter((w) => !TOPIC_STOPWORDS.has(w.toLowerCase()) && !TOPIC_ADJECTIVES.has(w.toLowerCase()));
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return "General";
}

// 清洗文本（去掉多余空白、行首连字符）
function cleanText(t) {
  return String(t || "")
    .replace(/^\s*[-•]\s*/, "")
    .trim();
}

function main() {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".json"));
  console.log(`读取 ${files.length} 个题库文件...`);

  const realGroups = [];   // { year, part, topic, questions[] }
  const predictedGroups = [];

  for (const file of files) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(join(SRC_DIR, file), "utf-8"));
    } catch (e) {
      console.warn(`跳过 ${file}: ${e.message}`);
      continue;
    }

    const collection = raw.collection || "";
    const year = yearFromCollection(collection);
    if (!year) {
      console.warn(`跳过 ${file}: 无法识别年份 (collection=${collection})`);
      continue;
    }

    // 从 Part2 提取 topic
    const parts = raw.parts || [];
    const p2 = parts.find((p) => String(p.part).includes("2"));
    const p2Text = p2?.questions?.[0]?.text || [];
    const topic = extractTopic(p2Text);

    // 逐 Part 生成分组
    for (const part of parts) {
      const partNum = part.part.match(/(\d)/)?.[1];
      if (!partNum || ![1, 2, 3].includes(Number(partNum))) continue;
      const isPredicted = year >= 2026 || collection.includes("Mock Test");
      const questions = (part.questions || []).map((q, i) => {
        const texts = (q.text || []).map(cleanText).filter(Boolean);
        const question = texts[0] || "";
        // cue card prompts（Part2）
        const prompts = (q.prompts || []).map(cleanText).filter(Boolean);
        const qObj = {
          id: `${raw.id}-p${partNum}-${i}`,
          question,
        };
        if (prompts.length > 0) qObj.cueCard = prompts;
        return qObj;
      }).filter((q) => q.question);

      const group = {
        year,
        part: Number(partNum),
        topic,
        questions,
      };
      (isPredicted ? predictedGroups : realGroups).push(group);
    }
  }

  // 汇总统计
  const countReal = realGroups.reduce((s, g) => s + g.questions.length, 0);
  const countPred = predictedGroups.reduce((s, g) => s + g.questions.length, 0);
  console.log(`真题: ${realGroups.length} 组 / ${countReal} 题`);
  console.log(`预测: ${predictedGroups.length} 组 / ${countPred} 题`);
  console.log(`真题年份: ${[...new Set(realGroups.map((g) => g.year))].sort()}`);
  console.log(`真题话题数: ${new Set(realGroups.map((g) => g.topic)).size}`);
  console.log(`真题话题样本: ${[...new Set(realGroups.map((g) => g.topic))].slice(0, 20).join(", ")}`);

  // 写入（真实题库替换，预测题库合并）
  mkdirSync(dirname(REAL_OUT), { recursive: true });
  mkdirSync(dirname(PRED_OUT), { recursive: true });
  writeFileSync(REAL_OUT, JSON.stringify(realGroups, null, 2), "utf-8");

  // 预测题库：保留现有 + 新导入的 Mock 2026
  let predicted = [];
  try {
    predicted = JSON.parse(readFileSync(PRED_OUT, "utf-8"));
  } catch {
    /* 无现有预测题 */
  }
  const existingIds = new Set(predicted.map((g) => `${g.year}-${g.topic}-${g.part}`));
  const mergedPred = [
    ...predicted,
    ...predictedGroups.filter((g) => {
      const key = `${g.year}-${g.topic}-${g.part}`;
      if (existingIds.has(key)) return false;
      existingIds.add(key);
      return true;
    }),
  ];
  writeFileSync(PRED_OUT, JSON.stringify(mergedPred, null, 2), "utf-8");
  console.log(`预测题库合并后: ${mergedPred.length} 组`);

  console.log("\n✓ 导入完成");
}

main();
