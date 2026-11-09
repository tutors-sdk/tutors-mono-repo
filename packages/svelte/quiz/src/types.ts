/**
 * Quiz data model. The format types (questions, parsed quiz, content split) belong to
 * @tutors/course-rules, which owns the quiz format; this package adds scoring.
 */

export type { ParsedQuiz, QuestionType, QuizContent, QuizQuestion } from "@tutors/course-rules/quiz";

export interface QuizScore {
  correct: number;
  total: number;
  /** `correct` as a whole-number percentage of `total`; 0 for an empty quiz. */
  percentage: number;
}
