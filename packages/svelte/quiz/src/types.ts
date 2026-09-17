/**
 * Quiz data model.
 *
 * Deliberately minimal: quizzes are authored by hand in course markdown, so
 * there is no authoring, session or persistence state to model yet. Later
 * phases add those types as they are actually needed.
 */

export type QuestionType = "multiple-choice" | "true-false";

export interface QuizQuestion {
  /** Stable within a quiz: `q1`, `q2`, ... in authored order. */
  id: string;
  type: QuestionType;
  text: string;
  options: string[];
  /** 0-based index into `options` of the correct answer. */
  correctIndex: number;
}

export interface ParsedQuiz {
  /** From the block's `title:` field; null means "use the learning object title". */
  title: string | null;
  /** Seconds allowed per question, or null for untimed. */
  timeLimit: number | null;
  questions: QuizQuestion[];
}

/** A quiz learning object's markdown, split into prose and quiz definition. */
export interface QuizContent {
  /** Everything outside the quiz fence, still markdown. */
  prose: string;
  /** The body of the quiz fence, or null if the document has none. */
  quizSource: string | null;
}
