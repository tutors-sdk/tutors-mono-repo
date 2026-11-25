import { describe, expect, it } from "vitest";
import { diagnoseQuiz } from "../../../packages/jsr/course-rules/src/quiz/diagnose";

const page = (block: string, after = "") => `# Week 1 quiz\n\nIntro.\n\n\`\`\`quiz\n${block}\n\`\`\`\n${after}`;
const good = "question: What is 1 + 1?\noptions:\n  - 2\n  - 3\ncorrect: 0";

describe("diagnoseQuiz", () => {
  it("finds nothing wrong with a quiz the reader shows as written", () => {
    expect(diagnoseQuiz(page(`title: Q\ntime_limit: 30\n---\n${good}\n---\nquestion: Sky is blue\ntype: true-false\ncorrect: true`))).toEqual([]);
    expect(diagnoseQuiz(page(good).replace(/\n/g, "\r\n"))).toEqual([]);
  });

  it("names a page with no quiz block, and a block with no questions", () => {
    expect(diagnoseQuiz("# Quiz\n\nNo questions here.")).toEqual([{ kind: "no-block" }]);
    expect(diagnoseQuiz(page(""))).toEqual([{ kind: "empty-block" }]);
    expect(diagnoseQuiz(page("title: Only a header"))).toEqual([{ kind: "empty-block" }]);
  });

  it("names each question the reader drops, by number, with a recognisable excerpt and the reason", () => {
    const block = [
      good,
      "question: No options at all",
      "question: One option\noptions:\n  - only\ncorrect: 0",
      "question: No answer given\noptions:\n  - a\n  - b",
      "question: Answer out of range\noptions:\n  - a\n  - b\ncorrect: 2",
      "question: Sky is green\ntype: true-false\ncorrect: maybe",
      "options:\n  - a\n  - b\ncorrect: 0",
      `question: ${"A very long question that goes on and on and on past sixty characters"}\noptions:\n  - a\ncorrect: 0`,
      "text: |\n  Alias with a block\noptions:\n  - a\ncorrect: 0"
    ].join("\n---\n");
    expect(diagnoseQuiz(page(block))).toEqual([
      { kind: "question", number: 2, excerpt: "No options at all", problem: "too-few-options", optionCount: 0 },
      { kind: "question", number: 3, excerpt: "One option", problem: "too-few-options", optionCount: 1 },
      { kind: "question", number: 4, excerpt: "No answer given", problem: "no-answer" },
      { kind: "question", number: 5, excerpt: "Answer out of range", problem: "answer-out-of-range", optionCount: 2, answer: "2" },
      { kind: "question", number: 6, excerpt: "Sky is green", problem: "answer-not-true-false", answer: "maybe" },
      { kind: "question", number: 7, excerpt: "", problem: "no-text" },
      { kind: "question", number: 8, excerpt: "A very long question that goes on and on and on past sixt...", problem: "too-few-options", optionCount: 1 },
      { kind: "question", number: 9, excerpt: "Alias with a block", problem: "too-few-options", optionCount: 1 }
    ]);
  });

  it("names a time limit that isn't a whole number of seconds", () => {
    expect(diagnoseQuiz(page(`time_limit: thirty\n---\n${good}`))).toEqual([{ kind: "time-limit", value: "thirty" }]);
    expect(diagnoseQuiz(page(`time_limit: 0\n---\n${good}`))).toEqual([{ kind: "time-limit", value: "0" }]);
    expect(diagnoseQuiz(page(`time_limit: 1.5\n---\n${good}`))).toEqual([{ kind: "time-limit", value: "1.5" }]);
  });

  it("names a second quiz block, which the reader shows as code", () => {
    expect(diagnoseQuiz(page(good, "\n```quiz\nquestion: Lost\n```\n"))).toEqual([{ kind: "second-block" }]);
    expect(diagnoseQuiz(page(good, "\n```js\nquiz\n```\n"))).toEqual([]);
  });
});
