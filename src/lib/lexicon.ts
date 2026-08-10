// 雅思口语词库分析（客户端）
// 从 exprtrain.online (et-app.js) 的英文词库移植并扩展，适配雅思场景。
// 客户端运行（毫秒级），用于实时字幕高亮 + 统计。

export type HighlightCategory =
  | "filler"
  | "hedge"
  | "vague"
  | "chinglish"
  | "grammar"
  | "good";

export interface TextStats {
  totalWords: number;
  fillers: number;
  hedges: number;
  vagueWords: number;
  chinglish: number;
  grammar: number;
  density: number; // 0-100，有效表达占比
  duration: number; // 秒
  lang?: AnalysisLang; // 本次分析的语种
}

export type AnalysisLang = "en" | "zh";

/** 根据 ASR 语言设置解析分析语言 */
export function langFromAsr(asrLang: string | undefined | null): AnalysisLang {
  return asrLang?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/**
 * 统计"表达单元"数：英文按空格分词，中文按"汉字数 + 混入英文词数 + 数字"。
 * 中文没有空格，字符级统计是合理代理。
 */
export function countUnits(text: string, lang: AnalysisLang = "en"): number {
  if (lang === "zh") {
    const cjk = text.match(/[一-龥]/g)?.length ?? 0;
    const latin = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
    const digits = text.match(/\d+(?:\.\d+)?/g)?.length ?? 0;
    return cjk + latin + digits;
  }
  return text.split(/\s+/).filter(Boolean).length;
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

// ===== 常见语法错误检测（轻量规则）=====
// 用于实时层，抓明显的句法/搭配错误；深度语法判断交给报告/评估
export const GRAMMAR_PATTERNS: { pattern: RegExp; suggestion: string; label: string }[] = [
  // 主谓不一致
  { pattern: /\bI\s+(is|are|was)\b/gi, suggestion: "I am / I was", label: "主谓不一致" },
  { pattern: /\b(he|she|it)\s+don't\b/gi, suggestion: "doesn't", label: "主谓不一致" },
  { pattern: /\b(he|she|it)\s+have\b/gi, suggestion: "has", label: "主谓不一致" },
  { pattern: /\b(we|they|you)\s+has\b/gi, suggestion: "have", label: "主谓不一致" },
  // 时态错误
  { pattern: /\bI\s+am\s+agree\b/gi, suggestion: "I agree", label: "时态/搭配" },
  { pattern: /\bI\s+am\s+like\b/gi, suggestion: "I like", label: "搭配错误" },
  { pattern: /\byesterday\s+(I\s+|we\s+)?(go|see|do|have|eat|buy|come|take|make)\b/gi, suggestion: "过去式 (went/saw/did/had/ate/bought/came/took/made)", label: "时态错误" },
  { pattern: /\blast\s+(week|year|month|night)\s+(I\s+|we\s+)?(go|see|do|have|eat|buy|come|take|make)\b/gi, suggestion: "过去式", label: "时态错误" },
  // 双比较/重复
  { pattern: /\bmore\s+better\b/gi, suggestion: "better", label: "比较级重复" },
  { pattern: /\bmore\s+(easy|good|big|happy)\b/gi, suggestion: "easier/better/bigger/happier", label: "比较级用法" },
  { pattern: /\bvery\s+very\b/gi, suggestion: "very", label: "程度词重复" },
  // 常见错误搭配
  { pattern: /\bmuch\s+people\b/gi, suggestion: "many people", label: "可数/不可数" },
  { pattern: /\bpeople\s+is\b/gi, suggestion: "people are", label: "主谓不一致" },
  { pattern: /\bequipment\s+are\b/gi, suggestion: "equipment is", label: "不可数名词" },
  { pattern: /\binformations?\b/gi, suggestion: "information (不可数)", label: "不可数名词" },
  { pattern: /\badvices?\b/gi, suggestion: "advice (不可数)", label: "不可数名词" },
  { pattern: /\benjoy\s+to\s+(play|go|do|eat|read|watch|swim)\b/gi, suggestion: "enjoy + -ing", label: "动词搭配" },
  { pattern: /\bmake\s+me\s+to\s+do\b/gi, suggestion: "make me do (不加 to)", label: "使役动词" },
  { pattern: /\bI\s+very\s+(like|want|enjoy|love)\b/gi, suggestion: "I really like", label: "程度副词位置" },
  { pattern: /\bbecause\s+so\b/gi, suggestion: "because / so（二选一）", label: "连词重复" },
  { pattern: /\balthough\s+but\b/gi, suggestion: "although / but（二选一）", label: "连词重复" },
];

// ===== 中文词库（语言模式 = 中文时使用）=====

// 填充词（中文口语口头禅 / 连接性口水词）
export const FILLER_WORDS_ZH = [
  "嗯", "呃", "啊", "诶", "哦", "额",
  "那个", "这个", "然后", "就是", "就是说",
  "怎么说呢", "怎么说", "怎么讲", "怎么说来着",
  "你知道", "你知道吧", "其实", "基本上", "总之", "反正", "对吧",
];

// 犹豫词 / 立场弱化（中文）
export const HEDGE_WORDS_ZH = [
  "也许", "或许", "大概", "可能", "应该", "差不多", "好像", "似乎",
  "我觉得", "我认为", "我想", "我猜", "我个人觉得", "个人而言",
  "某种程度上", "有些", "有点", "比较", "还算", "老实说",
];

// 低分词 → 高分替代（中文雅思场景）
export const VAGUE_TO_PRECISE_ZH: Record<string, string[]> = {
  好: ["出色", "优异", "精彩", "令人印象深刻"],
  很好: ["出类拔萃", "可圈可点", "叹为观止"],
  坏: ["糟糕", "恶劣", "不尽如人意"],
  不好: ["欠佳", "令人失望"],
  大: ["宏大", "广阔", "壮观", "规模庞大"],
  小: ["小巧", "精致", "袖珍"],
  多: ["繁多", "丰富", "琳琅满目", "数不胜数"],
  少: ["寥寥无几", "屈指可数", "稀缺"],
  快: ["迅速", "敏捷", "高效", "飞速"],
  慢: ["缓慢", "从容", "悠闲"],
  开心: ["愉悦", "欣喜", "雀跃", "心花怒放"],
  高兴: ["兴高采烈", "欢欣鼓舞", "喜出望外"],
  难过: ["沮丧", "失落", "苦闷", "心痛"],
  伤心: ["悲伤", "黯然神伤", "悲痛"],
  喜欢: ["喜爱", "钟情", "酷爱", "热衷于"],
  讨厌: ["反感", "厌恶", "避之不及"],
  重要: ["关键", "至关重要", "举足轻重", "不可或缺"],
  漂亮: ["美丽", "动人", "赏心悦目", "光彩夺目"],
  有名: ["著名", "闻名遐迩", "家喻户晓", "享有盛誉"],
  便宜: ["实惠", "划算", "物美价廉", "经济实惠"],
  贵: ["昂贵", "不菲", "价格不菲"],
  忙: ["忙碌", "繁忙", "马不停蹄", "应接不暇"],
  累: ["疲惫", "筋疲力尽", "精疲力竭"],
  生气: ["愤怒", "恼火", "愤愤不平"],
  害怕: ["恐惧", "忐忑不安", "胆战心惊"],
  有趣: ["妙趣横生", "引人入胜", "耐人寻味"],
  去: ["前往", "去往", "奔赴"],
  觉得: ["认为", "深感", "持……的看法"],
};

// 中式口语 / 口水词堆叠检测（中文）
export const CHINGLISH_PATTERNS_ZH: { pattern: RegExp; suggestion: string }[] = [
  { pattern: /然后\s*然后/gi, suggestion: "「接着/随后/此外」，避免重复连接词" },
  { pattern: /就是\s*就是/gi, suggestion: "删去多余的「就是」" },
  { pattern: /我觉得\s*我觉得/gi, suggestion: "直接陈述观点，避免重复" },
  { pattern: /非常\s*非常/gi, suggestion: "用「极其/格外」等程度副词" },
  { pattern: /真的\s*真的/gi, suggestion: "用「确实/的确」" },
  { pattern: /那个\s*那个/gi, suggestion: "停顿一下，避免重复「那个」" },
  { pattern: /然后\s*那个\s*就是/gi, suggestion: "整理好思路再开口，减少口水词连用" },
];

// 高分表达（正向强化，中文）
export const GOOD_PATTERNS_ZH: string[] = [
  "总而言之", "总的来说", "毋庸置疑", "显而易见", "毫无疑问",
  "值得一提的是", "令人印象深刻的是", "归根结底", "综上所述",
  "一方面", "另一方面", "不仅", "而且", "与此同时", "除此之外",
];

// 中文口语语法问题（轻量规则）
export const GRAMMAR_PATTERNS_ZH: { pattern: RegExp; suggestion: string; label: string }[] = [
  { pattern: /的\s*的/gi, suggestion: "删去重复的「的」", label: "重复字" },
  { pattern: /了\s*了/gi, suggestion: "删去多余的「了」", label: "重复字" },
];

// ===== 语言相关词库选择 =====

interface Lexicon {
  fillers: string[];
  hedges: string[];
  vague: Record<string, string[]>;
  chinglish: { pattern: RegExp; suggestion: string }[];
  good: string[]; // zh: 词组；en: 正则源串（构造时转 RegExp）
  grammar: { pattern: RegExp; suggestion: string; label: string }[];
}

function getLexicon(lang: AnalysisLang): Lexicon {
  return lang === "zh"
    ? {
        fillers: FILLER_WORDS_ZH,
        hedges: HEDGE_WORDS_ZH,
        vague: VAGUE_TO_PRECISE_ZH,
        chinglish: CHINGLISH_PATTERNS_ZH,
        good: GOOD_PATTERNS_ZH,
        grammar: GRAMMAR_PATTERNS_ZH,
      }
    : {
        fillers: FILLER_WORDS_EN,
        hedges: HEDGE_WORDS_EN,
        vague: VAGUE_TO_PRECISE_EN,
        chinglish: CHINGLISH_PATTERNS,
        good: GOOD_PATTERNS.map((r) => r.source),
        grammar: GRAMMAR_PATTERNS,
      };
}

/** 中文最长优先贪婪匹配：左到右非重叠，多字词优先（中文无 \b 边界） */
function matchChinese(
  text: string,
  phrases: string[],
): { word: string; index: number }[] {
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  const result: { word: string; index: number }[] = [];
  let i = 0;
  while (i < lower.length) {
    let matched: string | null = null;
    for (const phrase of sorted) {
      if (lower.startsWith(phrase, i)) {
        matched = phrase;
        break;
      }
    }
    if (matched) {
      result.push({ word: matched.toLowerCase(), index: i });
      i += matched.length;
    } else {
      i += 1;
    }
  }
  return result;
}

/** 语言感知的词组匹配入口 */
function matchInText(
  text: string,
  phrases: string[],
  lang: AnalysisLang,
): { word: string; index: number }[] {
  return lang === "zh"
    ? matchChinese(text, phrases)
    : matchWords(text.toLowerCase(), phrases);
}

/** 语言感知：中英文各自按对应规则分析；英文模式遇到中文自动降级到中文词库 */
function resolveLang(text: string, lang: AnalysisLang): AnalysisLang {
  if (lang === "en" && /[一-龥]/.test(text)) {
    return "zh";
  }
  return lang;
}

/** 检测常见语法错误（实时层，返回错误片段 + 建议） */
export function collectGrammarIssues(
  text: string,
  lang: AnalysisLang = "en",
): { word: string; suggestion: string; label: string }[] {
  const resolved = resolveLang(text, lang);
  const issues: { word: string; suggestion: string; label: string }[] = [];
  const lower = text.toLowerCase();
  for (const item of getLexicon(resolved).grammar) {
    let m: RegExpExecArray | null;
    while ((m = item.pattern.exec(lower)) !== null) {
      issues.push({ word: m[0], suggestion: item.suggestion, label: item.label });
    }
  }
  return issues;
}

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
export function analyzeText(
  text: string,
  lang: AnalysisLang = "en",
): TextStats | null {
  if (!text || !text.trim()) {
    return null;
  }

  const resolved = resolveLang(text, lang);
  const lexicon = getLexicon(resolved);
  const textLower = text.toLowerCase();
  const totalWords = countUnits(text, resolved);

  const fillers = matchInText(textLower, lexicon.fillers, resolved);
  const hedges = matchInText(textLower, lexicon.hedges, resolved);
  const vagueWords: string[] = [];
  const chinglishMatches: { matched: string; suggestion: string; index: number }[] = [];

  for (const key of Object.keys(lexicon.vague)) {
    if (resolved === "zh") {
      for (const _hit of matchChinese(textLower, [key])) {
        vagueWords.push(key.toLowerCase());
      }
    } else {
      const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
      let m: RegExpExecArray | null;
      while ((m = regex.exec(textLower)) !== null) {
        void m;
        vagueWords.push(key.toLowerCase());
      }
    }
  }

  for (const item of lexicon.chinglish) {
    let match: RegExpExecArray | null;
    while ((match = item.pattern.exec(textLower)) !== null) {
      chinglishMatches.push({
        matched: match[0],
        suggestion: item.suggestion,
        index: match.index,
      });
    }
  }

  const grammarMatches = collectGrammarIssues(text, resolved);

  const fillerCount = fillers.length;
  const hedgeCount = hedges.length;
  const vagueCount = vagueWords.length;
  const chinglishCount = chinglishMatches.length;
  const grammarCount = grammarMatches.length;

  // 中文：分母按"有效字符数"（总单元减去命中的填充/犹豫词组实际字符长度）
  let meaningful: number;
  if (resolved === "zh") {
    const noiseChars =
      fillers.reduce((s, m) => s + m.word.length, 0) +
      hedges.reduce((s, m) => s + m.word.length, 0);
    meaningful = Math.max(0, totalWords - noiseChars);
  } else {
    meaningful = totalWords - fillerCount - hedgeCount;
  }
  const density = totalWords > 0 ? Math.round((meaningful / totalWords) * 100) : 100;

  return {
    totalWords,
    fillers: fillerCount,
    hedges: hedgeCount,
    vagueWords: vagueCount,
    chinglish: chinglishCount,
    grammar: grammarCount,
    density,
    duration: 0,
    lang: resolved,
  };
}

/**
 * 把文本转成高亮 HTML（按词边界，带分类优先级）。
 * 优先：chinglish > vague > filler > hedge；同时标出高分表达。
 */
export function highlightTokens(text: string, lang: AnalysisLang = "en"): string {
  const resolved = resolveLang(text, lang);
  const lexicon = getLexicon(resolved);
  const textLower = text.toLowerCase();

  // 收集所有匹配 span：{ start, end, category, data }
  type Span = { start: number; end: number; category: HighlightCategory; label: string };
  const spans: Span[] = [];

  // 中式英语 / 口语堆叠（整短语，正则）
  for (const item of lexicon.chinglish) {
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
  for (const key of Object.keys(lexicon.vague)) {
    if (resolved === "zh") {
      for (const hit of matchChinese(textLower, [key])) {
        spans.push({
          start: hit.index,
          end: hit.index + key.length,
          category: "vague",
          label: lexicon.vague[key].slice(0, 3).join(" / "),
        });
      }
    } else {
      const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(textLower)) !== null) {
        spans.push({
          start: match.index,
          end: match.index + match[0].length,
          category: "vague",
          label: lexicon.vague[key].slice(0, 3).join(" / "),
        });
      }
    }
  }

  // 填充词
  for (const hit of matchInText(textLower, lexicon.fillers, resolved)) {
    spans.push({
      start: hit.index,
      end: hit.index + hit.word.length,
      category: "filler",
      label: "填充词 · try pausing",
    });
  }

  // 犹豫词
  for (const hit of matchInText(textLower, lexicon.hedges, resolved)) {
    spans.push({
      start: hit.index,
      end: hit.index + hit.word.length,
      category: "hedge",
      label: "犹豫词 · be direct",
    });
  }

  // 语法错误
  for (const item of lexicon.grammar) {
    let match: RegExpExecArray | null;
    while ((match = item.pattern.exec(textLower)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        category: "grammar",
        label: `${item.label} · ${item.suggestion}`,
      });
    }
  }

  // 高分表达
  if (resolved === "zh") {
    for (const hit of matchChinese(textLower, lexicon.good)) {
      spans.push({
        start: hit.index,
        end: hit.index + hit.word.length,
        category: "good",
        label: "高分表达",
      });
    }
  } else {
    for (const source of lexicon.good) {
      const regex = new RegExp(`\\b${source}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(textLower)) !== null) {
        spans.push({
          start: match.index,
          end: match.index + match[0].length,
          category: "good",
          label: "高分表达",
        });
      }
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
    grammar: 2,
    filler: 3,
    hedge: 4,
    good: 5,
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

/** 标黄词汇的匹配结果（供单题反馈的词汇联动交互使用） */
export interface VagueHit {
  start: number;
  end: number;
  original: string;
  suggestion: string;
}

/**
 * 收集文本中可提升的词汇表达（仅低分词，PRD 实时区"仅黄色·仅词汇"）。
 * 返回匹配位置与建议，供录制实时区 / 单题反馈使用。
 */
export function collectVagueHits(
  text: string,
  lang: AnalysisLang = "en",
): VagueHit[] {
  const resolved = resolveLang(text, lang);
  const lexicon = getLexicon(resolved);
  const textLower = text.toLowerCase();
  const hits: VagueHit[] = [];

  for (const key of Object.keys(lexicon.vague)) {
    const suggestion = lexicon.vague[key].slice(0, 3).join(" / ");
    if (resolved === "zh") {
      for (const hit of matchChinese(textLower, [key])) {
        hits.push({
          start: hit.index,
          end: hit.index + key.length,
          original: text.slice(hit.index, hit.index + key.length),
          suggestion,
        });
      }
    } else {
      const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(textLower)) !== null) {
        hits.push({
          start: match.index,
          end: match.index + match[0].length,
          original: match[0],
          suggestion,
        });
      }
    }
  }

  // 按位置排序
  hits.sort((a, b) => a.start - b.start);
  return hits;
}

/**
 * 只标黄色词汇的转写 HTML（PRD 实时区克制原则：实时区仅标可提升的词汇表达）。
 * 与 collectVagueHits 配对使用：同一个文本的两个视角（统计 + 渲染）。
 */
export function highlightVagueOnly(
  text: string,
  lang: AnalysisLang = "en",
): string {
  const hits = collectVagueHits(text, lang);
  if (hits.length === 0) {
    return escapeHtml(text);
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) {
      parts.push(escapeHtml(text.slice(cursor, hit.start)));
    }
    const raw = text.slice(hit.start, hit.end);
    const title = escapeAttr(hit.suggestion);
    parts.push(
      `<mark class="hl-vague" title="${title}" data-vague="${escapeAttr(hit.original)}" data-suggestion="${title}">${escapeHtml(raw)}</mark>`,
    );
    cursor = hit.end;
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
  lang: AnalysisLang = "en",
): { category: HighlightCategory; word: string; suggestion?: string }[] {
  const resolved = resolveLang(text, lang);
  const lexicon = getLexicon(resolved);
  const issues: { category: HighlightCategory; word: string; suggestion?: string }[] = [];
  const textLower = text.toLowerCase();

  for (const item of lexicon.chinglish) {
    let m: RegExpExecArray | null;
    while ((m = item.pattern.exec(textLower)) !== null) {
      issues.push({ category: "chinglish", word: m[0], suggestion: item.suggestion });
    }
  }
  for (const key of Object.keys(lexicon.vague)) {
    if (resolved === "zh") {
      for (const hit of matchChinese(textLower, [key])) {
        issues.push({ category: "vague", word: hit.word, suggestion: lexicon.vague[key].slice(0, 3).join(" / ") });
      }
    } else {
      const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
      let m: RegExpExecArray | null;
      while ((m = regex.exec(textLower)) !== null) {
        issues.push({ category: "vague", word: m[0], suggestion: lexicon.vague[key].slice(0, 3).join(" / ") });
      }
    }
  }
  for (const hit of matchInText(textLower, lexicon.fillers, resolved)) {
    issues.push({ category: "filler", word: hit.word });
  }
  for (const hit of matchInText(textLower, lexicon.hedges, resolved)) {
    issues.push({ category: "hedge", word: hit.word });
  }
  for (const item of lexicon.grammar) {
    let m: RegExpExecArray | null;
    while ((m = item.pattern.exec(textLower)) !== null) {
      issues.push({ category: "grammar", word: m[0], suggestion: item.suggestion });
    }
  }

  return issues;
}
