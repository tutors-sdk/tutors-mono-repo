/**
 * The quiz a learner takes: questions with one correct option each, and the score a set of
 * answers earns. How a quiz is written in course markdown (the format: parsing, diagnosis,
 * writing) belongs to the authoring toolchain, `@tutors/course-rules/quiz`; what it parses to is
 * this shape, and `tests/unit/quiz/quiz-model-agreement.test.ts` fails if the two drift apart.
 */

export type QuestionType = "multiple-choice" | "true-false";

export interface QuizQuestion {
  /** Stable within a quiz: `q1`, `q2`, ... in authored order. */
  readonly id: string;
  readonly type: QuestionType;
  readonly text: string;
  readonly options: readonly string[];
  /** 0-based index into `options` of the correct answer. */
  readonly correctIndex: number;
}

export interface Quiz {
  /** Null means "use the learning object's title". */
  readonly title: string | null;
  /** Seconds allowed per question, or null for untimed. */
  readonly timeLimit: number | null;
  readonly questions: readonly QuizQuestion[];
}

/** The name the quiz had before the format moved to course-rules; kept for the components that use it. */
export type ParsedQuiz = Quiz;

export interface QuizScore {
  readonly correct: number;
  readonly total: number;
  /** `correct` as a whole-number percentage of `total`; 0 for an empty quiz. */
  readonly percentage: number;
}
