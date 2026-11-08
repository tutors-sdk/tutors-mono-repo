/**
 * The quiz format: parse what the reader shows, say what it would drop, write a lecturer's draft.
 *
 * @module
 */
export { extractQuizBlock } from "./content.ts";
export type { QuizDiagnosis } from "./diagnose.ts";
export { diagnoseQuiz } from "./diagnose.ts";
export type { QuestionProblem } from "./parser.ts";
export { parseQuizMarkdown } from "./parser.ts";
export type { ParsedQuiz, QuestionType, QuizContent, QuizQuestion } from "./types.ts";
export type { QuizDraft, QuizDraftQuestion } from "./writer.ts";
export { QuizDraftError, writeQuizBlock, writeQuizPage } from "./writer.ts";
