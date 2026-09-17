import type { ParsedQuiz, QuizScore } from "../types.ts";

/** A student's answers: question id to the index of the option they chose. */
export type QuizAnswers = Record<string, number>;

/**
 * Score a set of answers against a quiz. Unanswered questions count as wrong
 * rather than being excluded, so the percentage is out of the whole quiz.
 */
export function scoreQuiz(quiz: ParsedQuiz, answers: QuizAnswers): QuizScore {
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((question) => answers[question.id] === question.correctIndex).length;
  return {
    correct,
    total,
    percentage: total > 0 ? Math.round((correct / total) * 100) : 0
  };
}

/** True once every question has an answer, which is what gates submission. */
export function isQuizComplete(quiz: ParsedQuiz, answers: QuizAnswers): boolean {
  return quiz.questions.every((question) => answers[question.id] !== undefined);
}
