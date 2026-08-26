import dataQuestionsReal from "@/../data/question-bank/real/index.json";
import dataQuestionsPredicted from "@/../data/question-bank/predicted/index.json";
import personalBackgroundData from "@/../data/personal-background/index.json";
import standardTopicsData from "@/../data/standard-topics/index.json";

export interface Question {
  id: string;
  year: number;
  part: 1 | 2 | 3;
  topic: string;
  question: string;
  /** Part 2 cue card 要点 */
  cueCard?: string[];
  /** Part 3 追问 */
  followUps?: string[];
  /** 是否预测题 */
  predicted: boolean;
}

export interface BankIndex {
  real: {
    years: number[];
    topics: string[];
    questions: Question[];
  };
  predicted: {
    years: number[];
    topics: string[];
    questions: Question[];
  };
}

function buildIndex(
  source: { year: number; part: 1 | 2 | 3; topic: string; questions: Omit<Question, "year" | "part" | "predicted">[] }[],
  predicted: boolean,
): BankIndex["real"] {
  const questions: Question[] = [];
  const years = new Set<number>();
  const topics = new Set<string>();

  for (const group of source) {
    years.add(group.year);
    topics.add(group.topic);
    for (const q of group.questions) {
      questions.push({
        id: `${predicted ? "p" : "r"}-${group.year}-${q.id}`,
        year: group.year,
        part: group.part,
        topic: group.topic,
        question: q.question,
        cueCard: q.cueCard,
        followUps: q.followUps,
        predicted,
      });
    }
  }

  return {
    years: [...years].sort((a, b) => b - a),
    topics: [...topics].sort(),
    questions,
  };
}

export function getBankIndex(): BankIndex {
  const real = buildIndex(dataQuestionsReal as never, false);
  const predicted = buildIndex(dataQuestionsPredicted as never, true);
  return { real, predicted };
}

export function getQuestionById(id: string): Question | null {
  const index = getBankIndex();
  return (
    [...index.real.questions, ...index.predicted.questions].find(
      (q) => q.id === id,
    ) ?? null
  );
}

/** 相似题：同 topic 或 Part 家族（Part2 故事题可映射 Part3 讨论题） */
export function getSimilarQuestions(question: Question): Question[] {
  const index = getBankIndex();
  const all = [...index.real.questions, ...index.predicted.questions];
  return all.filter(
    (q) =>
      q.id !== question.id &&
      (q.topic === question.topic ||
        (question.part === 2 && q.part === 3) ||
        (question.part === 3 && q.part === 2)),
  );
}

// ===== V1 熟悉话题（personal_background）=====

export const FAMILIAR_CATEGORY_IDS = [
  "work_study",
  "hometown",
  "residence",
] as const;

export type FamiliarCategoryId = (typeof FAMILIAR_CATEGORY_IDS)[number];

export interface FamiliarQuestion {
  id: string;
  question: string;
}

export interface FamiliarCategory {
  id: FamiliarCategoryId;
  label: { zh: string; en: string };
  questions: FamiliarQuestion[];
}

interface PersonalBackgroundData {
  version: string;
  status: string;
  categories: Record<string, FamiliarCategory>;
}

/** 熟悉话题题集版本（独立于标准题 bankVersion，PRD 4.2） */
export function getFamiliarSetVersion(): string {
  return (personalBackgroundData as PersonalBackgroundData).version;
}

/** 三个固定大类（顺序固定：工作/学习、家乡、住所） */
export function getFamiliarCategories(): FamiliarCategory[] {
  const data = personalBackgroundData as PersonalBackgroundData;
  return FAMILIAR_CATEGORY_IDS.map((id) => data.categories[id]).filter(
    (c): c is FamiliarCategory => Boolean(c),
  );
}

export function getFamiliarSet(
  categoryId: string,
): FamiliarCategory | null {
  const data = personalBackgroundData as PersonalBackgroundData;
  const category = data.categories[categoryId];
  return category && category.questions.length > 0 ? category : null;
}

// ===== V1 标准话题（standard_topic）=====

export type StandardTopicScope = "year" | "latest";
export type StandardTopicStatus = "draft" | "published" | "retired";

export interface StandardTopicSet {
  id: string;
  scope: StandardTopicScope;
  year: number;
  part: 1 | 2 | 3;
  topic: string;
  source: string;
  status: StandardTopicStatus;
  /** 是否属于固定诊断包（PRD 5.4：默认 8 道有效回答的标准题包） */
  diagnostic?: boolean;
  questionIds: string[];
}

export interface ResolvedStandardTopicSet extends StandardTopicSet {
  questions: { id: string; question: string }[];
}

interface StandardTopicsData {
  bankVersion: string;
  sets: StandardTopicSet[];
}

/** 标准题题集版本（PRD 4.3：bankVersion，会话创建时冻结） */
export function getStandardBankVersion(): string {
  return (standardTopicsData as StandardTopicsData).bankVersion;
}

/** 学习端只返回 published 且题量满足要求（≥3）的题组 */
function publishedSets(): StandardTopicSet[] {
  const data = standardTopicsData as StandardTopicsData;
  return data.sets.filter(
    (s) => s.status === "published" && s.questionIds.length >= 3,
  );
}

export function getStandardTopicSets(): StandardTopicSet[] {
  return publishedSets();
}

export function getStandardTopicSetsByScope(
  scope: StandardTopicScope,
  year?: number,
): StandardTopicSet[] {
  const sets = publishedSets().filter((s) => s.scope === scope);
  return typeof year === "number"
    ? sets.filter((s) => s.year === year)
    : sets;
}

export function getStandardTopicSetById(id: string): StandardTopicSet | null {
  return publishedSets().find((s) => s.id === id) ?? null;
}

/** 年份入口选项：仅含 scope=year 的已发布题组年份（倒序） */
export function getStandardTopicYears(): number[] {
  const years = new Set(
    publishedSets()
      .filter((s) => s.scope === "year")
      .map((s) => s.year),
  );
  return [...years].sort((a, b) => b - a);
}

/** 固定诊断包：published + diagnostic 标记的题组（默认 2 组 × 4 题 = 8 题） */
export function getDiagnosticTopicSets(): StandardTopicSet[] {
  return publishedSets().filter((s) => s.diagnostic === true);
}

/** 把题组 id 解析为题目文本（保持 questionIds 顺序；缺失 id 跳过） */
export function resolveStandardTopicSet(
  set: StandardTopicSet,
): ResolvedStandardTopicSet {
  const byId = new Map(
    getBankIndex().real.questions
      .concat(getBankIndex().predicted.questions)
      .map((q) => [q.id, q]),
  );
  const questions = set.questionIds
    .map((id) => byId.get(id))
    .filter((q): q is Question => Boolean(q))
    .map((q) => ({ id: q.id, question: q.question }));
  return { ...set, questions };
}
