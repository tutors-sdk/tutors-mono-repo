import { describe, expect, it } from "vitest";
import { parseQuizMarkdown, type ParsedQuiz as FormatQuiz } from "../../../packages/jsr/course-rules/src/quiz/mod";
import { scoreQuiz, type Quiz } from "../../../packages/domain/src/quiz/index";

/**
 * The domain owns the quiz a learner takes; the authoring toolchain owns the markdown format and
 * may not be imported by the domain. These assignments fail type-checking, and the test fails at
 * run time, when what the format parses to stops being the domain's quiz.
 */
describe("the quiz format parses to the domain's quiz", () => {
  it("scores a parsed quiz without conversion", () => {
    const parsed: FormatQuiz = parseQuizMarkdown("question: Two plus two is four.\ntype: true-false\ncorrect: true\n");
    const quiz: Quiz = parsed;
    const back: FormatQuiz = { title: quiz.title, timeLimit: quiz.timeLimit, questions: quiz.questions.map((q) => ({ ...q, options: [...q.options] })) };
    expect(back).toEqual(parsed);
    expect(scoreQuiz(quiz, { [quiz.questions[0].id]: quiz.questions[0].correctIndex })).toEqual({ correct: 1, total: 1, percentage: 100 });
  });
});
