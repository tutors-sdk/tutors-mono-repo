/** Quiz: the quiz a learner takes and how their answers are scored. The markdown format is `@tutors/course-rules/quiz`. */
export { isQuizComplete, scoreQuiz } from "./services/quiz-score.ts";
export type { QuizAnswers } from "./services/quiz-score.ts";
export type { ParsedQuiz, QuestionType, Quiz, QuizQuestion, QuizScore } from "./types.ts";
