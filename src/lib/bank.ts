import dataQuestionsReal from "@/../data/question-bank/real/index.json";
import dataQuestionsPredicted from "@/../data/question-bank/predicted/index.json";

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

export function getQuestions(
  category: "real" | "predicted",
  filter?: { part?: number; year?: number; topic?: string },
): Question[] {
  const index = getBankIndex()[category];
  let result = index.questions;
  if (filter?.part) result = result.filter((q) => q.part === filter.part);
  if (filter?.year) result = result.filter((q) => q.year === filter.year);
  if (filter?.topic) result = result.filter((q) => q.topic === filter.topic);
  return result;
}

export function getQuestionById(id: string): Question | null {
  const index = getBankIndex();
  return (
    [...index.real.questions, ...index.predicted.questions].find(
      (q) => q.id === id,
    ) ?? null
  );
}

export function getTopics(category: "real" | "predicted"): string[] {
  return getBankIndex()[category].topics;
}

/** 按年份返回该年份下的话题列表（用于层级筛选：先选年份 → 再选话题） */
export function getTopicsByYear(
  category: "real" | "predicted",
  year: number,
): string[] {
  const questions = getQuestions(category, { year });
  return [...new Set(questions.map((q) => q.topic))].sort();
}

export function getYears(category: "real" | "predicted"): number[] {
  return getBankIndex()[category].years;
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

/** 首次诊断固定题目：Part1/2/3 各选一题（保证可比性） */
export function getDiagnosticQuestions(): Question[] {
  const index = getBankIndex();
  const real = index.real.questions;
  const p1 = real.find((q) => q.part === 1 && !q.predicted);
  const p2 = real.find((q) => q.part === 2 && !q.predicted);
  const p3 = real.find((q) => q.part === 3 && !q.predicted);
  return [p1, p2, p3].filter(Boolean) as Question[];
}
