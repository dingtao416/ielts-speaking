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

export function getYears(category: "real" | "predicted"): number[] {
  return getBankIndex()[category].years;
}
