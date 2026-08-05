// 雅思口语词库分析（客户端）
// 从 exprtrain.online (et-app.js) 的英文词库移植并扩展，适配雅思场景。
// 客户端运行（毫秒级），用于实时字幕高亮 + 统计。

export type HighlightCategory =
  | "filler"
  | "hedge"
  | "vague"
  | "chinglish"
  | "good";

export interface TextStats {
  totalWords: number;
  fillers: number;
  hedges: number;
  vagueWords: number;
  chinglish: number;
  density: number; // 0-100，有效表达占比
  duration: number; // 秒
}

// ===== 填充词（多词短语会按词边界正则匹配）=====
export const FILLER_WORDS_EN = [
  "um",
  "uh",
  "ah",
  "er",
  "like",
  "you know",
  "basically",
  "actually",
  "literally",
  "I mean",
  "you see",
  "kind of like",
  "sort of like",
  "right",
  "well",
  "okay so",
  "so",
];

// ===== 犹豫词 / 立场弱化 =====
export const HEDGE_WORDS_EN = [
  "maybe",
  "perhaps",
  "probably",
  "I think",
  "I guess",
  "I suppose",
  "kind of",
  "sort of",
  "a little bit",
  "somewhat",
  "it seems",
  "more or less",
  "in a way",
  "arguably",
  "I feel like",
];

// ===== 低分词 → 高分词映射（雅思词汇资源维度）=====
// 扩展自参考实现，覆盖雅思口语高频低分词。
export const VAGUE_TO_PRECISE_EN: Record<string, string[]> = {
  good: ["excellent", "outstanding", "remarkable", "exceptional", "superb", "stellar"],
  bad: ["terrible", "dreadful", "appalling", "atrocious", "disastrous", "abysmal"],
  big: ["enormous", "substantial", "colossal", "immense", "massive", "considerable"],
  small: ["minuscule", "negligible", "trivial", "microscopic", "compact", "modest"],
  very: ["exceptionally", "remarkably", "extraordinarily", "tremendously", "profoundly", "intensely"],
  "a lot": ["extensively", "abundantly", "substantially", "considerably", "tremendously", "immensely"],
  thing: ["aspect", "element", "factor", "component", "phenomenon", "concept"],
  stuff: ["material", "content", "resources", "elements", "components", "substance"],
  nice: ["delightful", "pleasant", "exquisite", "charming", "gracious", "splendid"],
  happy: ["elated", "thrilled", "ecstatic", "overjoyed", "euphoric", "jubilant"],
  sad: ["devastated", "heartbroken", "melancholy", "sorrowful", "despondent", "grief-stricken"],
  interesting: ["fascinating", "compelling", "captivating", "intriguing", "riveting", "thought-provoking"],
  important: ["crucial", "vital", "essential", "paramount", "significant", "critical"],
  hard: ["challenging", "demanding", "grueling", "strenuous", "arduous", "formidable"],
  easy: ["effortless", "straightforward", "seamless", "intuitive", "manageable", "uncomplicated"],
  fast: ["rapid", "swift", "lightning-fast", "instantaneous", "brisk", "accelerated"],
  slow: ["gradual", "sluggish", "unhurried", "leisurely", "plodding", "painstaking"],
  get: ["obtain", "acquire", "secure", "achieve", "attain", "procure"],
  make: ["create", "construct", "produce", "generate", "establish", "craft"],
  really: ["genuinely", "truly", "undeniably", "absolutely", "undoubtedly", "fundamentally"],
  // 雅思口语额外低分词
  bigcity: ["metropolis", "megacity", "cosmopolitan city"],
  beautiful: ["stunning", "breathtaking", "picturesque", "captivating"],
  famous: ["renowned", "celebrated", "distinguished", "illustrious"],
  cheap: ["affordable", "budget-friendly", "economical", "reasonably priced"],
  expensive: ["pricey", "costly", "exorbitant", "premium"],
  busy: ["hectic", "fast-paced", "chaotic", "bustling"],
  tired: ["exhausted", "drained", "worn out", "fatigued"],
  angry: ["furious", "livid", "infuriated", "outraged"],
  afraid: ["terrified", "petrified", "apprehensive", "anxious"],
  funny: ["hilarious", "amusing", "witty", "comical"],
  "a lot of": ["a great deal of", "an abundance of", "numerous", "a wealth of"],
  people: ["individuals", "residents", "citizens", "the general public"],
  help: ["assist", "support", "facilitate", "aid"],
  think: ["believe", "maintain", "reckon", "hold the view that"],
  want: ["desire", "aspire", "yearn for", "be eager to"],
  "very good": ["superb", "outstanding", "first-rate", "top-notch"],
  "very bad": ["atrocious", "appalling", "horrendous", "detestable"],
  friend: ["companion", "close acquaintance", "confidant"],
  child: ["youngster", "minor", "kid"],
  old: ["elderly", "aged", "senior"],
  new: ["brand-new", "novel", "cutting-edge"],
  "like to": ["enjoy", "delight in", "take pleasure in"],
  quite: ["considerably", "fairly", "markedly"],
  always: ["invariably", "consistently", "without exception"],
  "the most important": ["paramount", "of paramount importance", "foremost"],
  money: ["funds", "capital", "financial resources"],
  problem: ["issue", "challenge", "obstacle", "concern"],
  answer: ["respond", "reply", "address"],
  change: ["transform", "modify", "alter", "shift"],
  improve: ["enhance", "refine", "optimize", "boost"],
  learn: ["acquire knowledge of", "pick up", "master"],
  "make sure": ["ensure", "guarantee", "ascertain"],
  "find out": ["discover", "determine", "uncover"],
  use: ["utilize", "employ", "leverage"],
  "talk about": ["discuss", "elaborate on", "delve into"],
  "look at": ["examine", "consider", "explore"],
  great: ["tremendous", "magnificent", "splendid", "superb"],
  "very much": ["immensely", "tremendously", "profoundly"],
  start: ["commence", "embark on", "initiate"],
  finish: ["conclude", "wrap up", "complete"],
  "get used to": ["become accustomed to", "adapt to", "grow familiar with"],
  "like": ["be fond of", "have a penchant for", "be partial to"],
  hate: ["detest", "despise", "loathe", "abhor"],
  "good at": ["proficient in", "adept at", "skilled at"],
  "not good": ["inadequate", "substandard", "below par"],
  "very happy": ["over the moon", "thrilled", "delighted"],
  "very tired": ["dead beat", "burned out", "drained"],
  "very important": ["crucial", "indispensable", "vital"],
};

// ===== 中式英语 / 不地道表达检测 =====
// 正则匹配常见 Chinglish 或 unnatural 模式，给出更自然的替代。
export const CHINGLISH_PATTERNS: { pattern: RegExp; suggestion: string }[] = [
  { pattern: /\bvery\s+delicious\b/gi, suggestion: "absolutely delicious / mouth-watering" },
  { pattern: /\bI\s+very\s+like\b/gi, suggestion: "I really like / I'm very fond of" },
  { pattern: /\bgive\s+me\s+a\s+look\b/gi, suggestion: "have a look / take a look" },
  { pattern: /\bstudy\s+well\b/gi, suggestion: "study hard / perform well in studies" },
  { pattern: /\blearn\s+knowledge\b/gi, suggestion: "gain knowledge / acquire knowledge" },
  { pattern: /\bopen\s+(my|the)\s+eyes?\b/gi, suggestion: "opened my eyes / broadened my horizons" },
  { pattern: /\bmy\s+English\s+is\s+very\s+poor\b/gi, suggestion: "my English is not that strong" },
  { pattern: /\byour\s+meaning\b/gi, suggestion: "what you mean / your point" },
  { pattern: /\bbody\s+is\s+very\s+healthy\b/gi, suggestion: "I'm in good shape / I keep fit" },
  { pattern: /\bgo\s+to\s+abroad\b/gi, suggestion: "go abroad" },
  { pattern: /\blisten\s+(to\s+)?songs?\b/gi, suggestion: "listen to music" },
  { pattern: /\bwatch\s+(on\s+)?(tv|television)\b/gi, suggestion: "watch TV" },
  { pattern: /\bplay\s+(mobile|cell)\s+phone\b/gi, suggestion: "use my phone / play on my phone" },
  { pattern: /\bdo\s+my\s+homework\s+at\s+home\b/gi, suggestion: "do my homework" },
  { pattern: /\bin\s+my\s+opinion\s+I\s+think\b/gi, suggestion: "In my opinion, …" },
  { pattern: /\bwith\s+the\s+development\s+of\s+(the\s+)?society\b/gi, suggestion: "as society develops" },
  { pattern: /\bno\s+matter\s+what\s+kind\s+of\s+how\b/gi, suggestion: "however / no matter how" },
  { pattern: /\bit\s+is\s+convenient\s+for\s+me\s+to\s+do\s+my\s+things\b/gi, suggestion: "it's convenient for me" },
  { pattern: /\bmake\s+my\s+life\s+more\s+convenient\b/gi, suggestion: "makes life easier" },
  { pattern: /\bI\s+am\s+very\s+satisfied\s+with\s+my\s+life\s+now\b/gi, suggestion: "I'm quite content with my life now" },
];

// ===== 高分表达捕获（正向强化）=====
export const GOOD_PATTERNS: RegExp[] = [
  /\b(however|nevertheless|nonetheless)\b/gi,
  /\b(therefore|consequently|as a result)\b/gi,
  /\b(in my view|from my perspective|to my mind)\b/gi,
  /\b(it is worth noting|notably|particularly)\b/gi,
  /\b(remarkable|stunning|crucial|vital|essential)\b/gi,
  /\b(thanks to|owing to|due to)\b/gi,
  /\b(whereas|while|although|even though)\b/gi,
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 按词边界匹配多词短语（如 "you know"） */
function matchWords(
  textLower: string,
  words: string[],
): { word: string; index: number }[] {
  const matches: { word: string; index: number }[] = [];
  const sorted = [...words].sort((a, b) => b.length - a.length);
  for (const word of sorted) {
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(textLower)) !== null) {
      matches.push({ word: word.toLowerCase(), index: match.index });
    }
  }
  return matches;
}

/** 分析文本，返回统计与匹配结果 */
export function analyzeText(text: string): TextStats | null {
  if (!text || !text.trim()) {
    return null;
  }

  const textLower = text.toLowerCase();
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const totalWords = words.length;

  const fillers = matchWords(textLower, FILLER_WORDS_EN);
  const hedges = matchWords(textLower, HEDGE_WORDS_EN);
  const vagueWords: string[] = [];
  const chinglishMatches: { matched: string; suggestion: string; index: number }[] = [];

  for (const key of Object.keys(VAGUE_TO_PRECISE_EN)) {
    const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(textLower)) !== null) {
      void m;
      vagueWords.push(key.toLowerCase());
    }
  }

  for (const item of CHINGLISH_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = item.pattern.exec(textLower)) !== null) {
      chinglishMatches.push({
        matched: match[0],
        suggestion: item.suggestion,
        index: match.index,
      });
    }
  }

  const fillerCount = fillers.length;
  const hedgeCount = hedges.length;
  const vagueCount = vagueWords.length;
  const chinglishCount = chinglishMatches.length;
  const meaningful = totalWords - fillerCount - hedgeCount;
  const density = totalWords > 0 ? Math.round((meaningful / totalWords) * 100) : 100;

  return {
    totalWords,
    fillers: fillerCount,
    hedges: hedgeCount,
    vagueWords: vagueCount,
    chinglish: chinglishCount,
    density,
    duration: 0,
  };
}

/**
 * 把文本转成高亮 HTML（按词边界，带分类优先级）。
 * 优先：chinglish > vague > filler > hedge；同时标出高分表达。
 */
export function highlightTokens(text: string): string {
  const textLower = text.toLowerCase();

  // 收集所有匹配 span：{ start, end, category, data }
  type Span = { start: number; end: number; category: HighlightCategory; label: string };
  const spans: Span[] = [];

  // 中式英语（整短语）
  for (const item of CHINGLISH_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = item.pattern.exec(textLower)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        category: "chinglish",
        label: item.suggestion,
      });
    }
  }

  // 低分词 → 高分替代
  for (const key of Object.keys(VAGUE_TO_PRECISE_EN)) {
    const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(textLower)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        category: "vague",
        label: VAGUE_TO_PRECISE_EN[key].slice(0, 3).join(" / "),
      });
    }
  }

  // 填充词
  for (const word of FILLER_WORDS_EN) {
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(textLower)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        category: "filler",
        label: "填充词 · try pausing",
      });
    }
  }

  // 犹豫词
  for (const word of HEDGE_WORDS_EN) {
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(textLower)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        category: "hedge",
        label: "犹豫词 · be direct",
      });
    }
  }

  // 高分表达
  for (const pattern of GOOD_PATTERNS) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(textLower)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        category: "good",
        label: "高分表达",
      });
    }
  }

  if (spans.length === 0) {
    return escapeHtml(text);
  }

  // 排序，重叠时按优先级分类处理
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const priority: Record<HighlightCategory, number> = {
    chinglish: 0,
    vague: 1,
    filler: 2,
    hedge: 3,
    good: 4,
  };

  // 去除被更高优先级完全覆盖的 span
  const kept: Span[] = [];
  for (const span of spans) {
    const overlapping = kept.find(
      (k) =>
        span.start < k.end &&
        span.end > k.start,
    );
    if (!overlapping) {
      kept.push(span);
      continue;
    }
    // 完全包含或被包含 → 保留优先级高的
    if (
      span.start <= overlapping.start &&
      span.end >= overlapping.end
    ) {
      if (priority[span.category] < priority[overlapping.category]) {
        kept[kept.indexOf(overlapping)] = span;
      }
    } else if (
      overlapping.start <= span.start &&
      overlapping.end >= span.end
    ) {
      // overlapping 完全包含 span：保留 overlapping
    } else {
      kept.push(span);
    }
  }

  // 按位置输出 HTML
  const parts: string[] = [];
  let cursor = 0;
  for (const span of kept) {
    if (span.start < cursor) continue;
    if (span.start > cursor) {
      parts.push(escapeHtml(text.slice(cursor, span.start)));
    }
    const raw = text.slice(span.start, span.end);
    const cls = `hl-${span.category}`;
    const title = escapeAttr(span.label);
    parts.push(`<mark class="${cls}" title="${title}" data-cat="${span.category}">${escapeHtml(raw)}</mark>`);
    cursor = span.end;
  }
  if (cursor < text.length) {
    parts.push(escapeHtml(text.slice(cursor)));
  }

  return parts.join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string) {
  return value.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** 从高亮 HTML 提取问题词清单（用于统计面板 / 反馈） */
export function collectIssues(
  text: string,
): { category: HighlightCategory; word: string; suggestion?: string }[] {
  const issues: { category: HighlightCategory; word: string; suggestion?: string }[] = [];
  const textLower = text.toLowerCase();

  for (const item of CHINGLISH_PATTERNS) {
    let m: RegExpExecArray | null;
    while ((m = item.pattern.exec(textLower)) !== null) {
      issues.push({ category: "chinglish", word: m[0], suggestion: item.suggestion });
    }
  }
  for (const key of Object.keys(VAGUE_TO_PRECISE_EN)) {
    const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(textLower)) !== null) {
      issues.push({ category: "vague", word: m[0], suggestion: VAGUE_TO_PRECISE_EN[key].slice(0, 3).join(" / ") });
    }
  }
  for (const word of FILLER_WORDS_EN) {
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(textLower)) !== null) {
      issues.push({ category: "filler", word: m[0] });
    }
  }
  for (const word of HEDGE_WORDS_EN) {
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(textLower)) !== null) {
      issues.push({ category: "hedge", word: m[0] });
    }
  }

  return issues;
}
