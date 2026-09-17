import { describe, it, expect } from "vitest";
import { parseQuizMarkdown } from "../../../packages/svelte/quiz/src/services/quiz-parser";

const MULTIPLE_CHOICE = `question: Which keyword is block-scoped?
type: multiple-choice
options:
  - var
  - let
  - const
correct: 1`;

describe("parseQuizMarkdown: header", () => {
  it("reads title and time_limit from the header section", () => {
    const quiz = parseQuizMarkdown(`title: My Quiz\ntime_limit: 30\n---\n${MULTIPLE_CHOICE}`);
    expect(quiz?.title).toBe("My Quiz");
    expect(quiz?.timeLimit).toBe(30);
  });

  it("returns a null title when the header omits one, so the LO title is used", () => {
    const quiz = parseQuizMarkdown(`time_limit: 30\n---\n${MULTIPLE_CHOICE}`);
    expect(quiz?.title).toBeNull();
  });

  it("treats a leading section carrying question text as a question, not a header", () => {
    const quiz = parseQuizMarkdown(MULTIPLE_CHOICE);
    expect(quiz?.questions).toHaveLength(1);
    expect(quiz?.title).toBeNull();
  });

  it("strips surrounding quotes from a title", () => {
    const quiz = parseQuizMarkdown(`title: "My Quiz"\n---\n${MULTIPLE_CHOICE}`);
    expect(quiz?.title).toBe("My Quiz");
  });

  it.each([
    ["absent", ""],
    ["zero", "time_limit: 0\n"],
    ["negative", "time_limit: -5\n"],
    ["non-numeric", "time_limit: soon\n"],
  ])("treats a %s time_limit as untimed", (_label, header) => {
    const quiz = parseQuizMarkdown(`title: T\n${header}---\n${MULTIPLE_CHOICE}`);
    expect(quiz?.timeLimit).toBeNull();
  });
});

describe("parseQuizMarkdown: multiple-choice questions", () => {
  it("parses text, options and the correct index", () => {
    const quiz = parseQuizMarkdown(MULTIPLE_CHOICE);
    expect(quiz?.questions[0]).toEqual({
      id: "q1",
      type: "multiple-choice",
      text: "Which keyword is block-scoped?",
      options: ["var", "let", "const"],
      correctIndex: 1,
    });
  });

  it("defaults to multiple-choice when type is omitted", () => {
    const quiz = parseQuizMarkdown("question: Pick one\noptions:\n  - a\n  - b\ncorrect: 0");
    expect(quiz?.questions[0].type).toBe("multiple-choice");
  });

  it("accepts `text` as an alias for `question`", () => {
    const quiz = parseQuizMarkdown("text: Pick one\noptions:\n  - a\n  - b\ncorrect: 0");
    expect(quiz?.questions[0].text).toBe("Pick one");
  });

  it("numbers question ids in authored order", () => {
    const quiz = parseQuizMarkdown(`${MULTIPLE_CHOICE}\n---\n${MULTIPLE_CHOICE}`);
    expect(quiz?.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
  });
});

describe("parseQuizMarkdown: true-false questions", () => {
  it.each([
    ["true", 0],
    ["True", 0],
    ["0", 0],
    ["false", 1],
    ["FALSE", 1],
    ["1", 1],
  ])("maps correct: %s to index %i", (correct, expected) => {
    const quiz = parseQuizMarkdown(`question: Is it so?\ntype: true-false\ncorrect: ${correct}`);
    expect(quiz?.questions[0].correctIndex).toBe(expected);
    expect(quiz?.questions[0].options).toEqual(["True", "False"]);
  });

  it("needs no options list", () => {
    const quiz = parseQuizMarkdown("question: Is it so?\ntype: true-false\ncorrect: true");
    expect(quiz?.questions[0].options).toEqual(["True", "False"]);
  });

  it("rejects a correct value that is neither true nor false", () => {
    expect(parseQuizMarkdown("question: Is it so?\ntype: true-false\ncorrect: maybe")).toBeNull();
  });
});

describe("parseQuizMarkdown: rejects malformed questions", () => {
  it.each([
    ["no question text", "type: multiple-choice\noptions:\n  - a\n  - b\ncorrect: 0"],
    ["no options", "question: Pick one\ncorrect: 0"],
    ["only one option", "question: Pick one\noptions:\n  - a\ncorrect: 0"],
    ["missing correct", "question: Pick one\noptions:\n  - a\n  - b"],
    ["correct out of range", "question: Pick one\noptions:\n  - a\n  - b\ncorrect: 5"],
    ["negative correct", "question: Pick one\noptions:\n  - a\n  - b\ncorrect: -1"],
    ["non-numeric correct", "question: Pick one\noptions:\n  - a\n  - b\ncorrect: second"],
  ])("returns null when a lone question has %s", (_label, source) => {
    expect(parseQuizMarkdown(source)).toBeNull();
  });

  it("drops a malformed question but keeps the valid ones", () => {
    const quiz = parseQuizMarkdown(`${MULTIPLE_CHOICE}\n---\nquestion: Broken\noptions:\n  - a\n  - b\ncorrect: 9`);
    expect(quiz?.questions).toHaveLength(1);
    expect(quiz?.questions[0].text).toBe("Which keyword is block-scoped?");
  });

  it("renumbers ids so a dropped question leaves no gap", () => {
    const quiz = parseQuizMarkdown(
      `question: Broken\noptions:\n  - a\n  - b\ncorrect: 9\n---\n${MULTIPLE_CHOICE}`
    );
    expect(quiz?.questions.map((q) => q.id)).toEqual(["q1"]);
  });
});

describe("parseQuizMarkdown: empty and header-only input", () => {
  it.each([
    ["an empty string", ""],
    ["whitespace only", "   \n\n  "],
    ["a header with no questions", "title: My Quiz\ntime_limit: 30"],
    ["separators with no content", "---\n---\n---"],
  ])("returns null for %s", (_label, source) => {
    expect(parseQuizMarkdown(source)).toBeNull();
  });
});
