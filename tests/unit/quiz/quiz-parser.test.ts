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

describe("parseQuizMarkdown: multi-line text", () => {
  it("keeps the old reading of options written as bare lines", () => {
    const quiz = parseQuizMarkdown("question: Pick one\noptions:\n  alpha\n  beta\ncorrect: 1");
    expect(quiz?.questions[0].options).toEqual(["alpha", "beta"]);
  });

  it("ends an option list at any other `name: value` line, as before", () => {
    const quiz = parseQuizMarkdown("question: Pick one\noptions:\n  - a\n  - b\nhint: none\n  - c\ncorrect: 1");
    expect(quiz?.questions[0].options).toEqual(["a", "b"]);
  });

  it("accepts a YAML `|` after question and drops the common indentation", () => {
    const quiz = parseQuizMarkdown("question: |\n  Read this:\n\n  ```py\n  if x:\n      y()\n  ```\noptions:\n  - a\n  - b\ncorrect: 0");
    expect(quiz?.questions[0].text).toBe("Read this:\n\n```py\nif x:\n    y()\n```");
  });

  it("keeps a code fence opened on the dash line, with its body at the dash's indent", () => {
    const quiz = parseQuizMarkdown("question: Which?\noptions:\n  - ```js\n  a()\n  ```\n  - b\ncorrect: 0");
    expect(quiz?.questions[0].options).toEqual(["```js\na()\n```", "b"]);
  });

  it("does not split questions on a `---` line inside a tilde fence", () => {
    const quiz = parseQuizMarkdown("question: What is this?\n~~~md\n---\n~~~\noptions:\n  - a\n  - b\ncorrect: 0");
    expect(quiz?.questions).toHaveLength(1);
    expect(quiz?.questions[0].text).toBe("What is this?\n~~~md\n---\n~~~");
  });

  it("drops a question section that has no question text", () => {
    expect(parseQuizMarkdown("title: Quiz\n---\noptions:\n  - a\n  - b\ncorrect: 0")).toBeNull();
  });

  it("drops a question whose `question:` is empty", () => {
    expect(parseQuizMarkdown("question:\noptions:\n  - a\n  - b\ncorrect: 0")).toBeNull();
  });

  it("keeps the first of two `question:` lines", () => {
    const quiz = parseQuizMarkdown("question: First\nquestion: Second\noptions:\n  - a\n  - b\ncorrect: 0");
    expect(quiz?.questions[0].text).toBe("First");
  });

  it("skips blank lines before the first option and after a lone `|`", () => {
    const quiz = parseQuizMarkdown("question: Which?\noptions:\n\n  - |\n\n    ```js\n    a()\n    ```\n\n    Then b.\n  - b\ncorrect: 0");
    expect(quiz?.questions[0].options).toEqual(["```js\na()\n```\n\nThen b.", "b"]);
  });

  it("strips quotes from a quoted first line followed by a code block", () => {
    const quiz = parseQuizMarkdown('question: "What prints?"\n```js\nf()\n```\noptions:\n  - "Output:"\n    ```\n    1\n    ```\n  - b\ncorrect: 0');
    expect(quiz?.questions[0].text).toBe("What prints?\n```js\nf()\n```");
    expect(quiz?.questions[0].options[0]).toBe("Output:\n```\n1\n```");
  });

  it("reads a quiz saved with Windows line endings", () => {
    const quiz = parseQuizMarkdown("question: One\r\noptions:\r\n  - a\r\n  - b\r\ncorrect: 0\r\n---\r\nquestion: Two\r\noptions:\r\n  - a\r\n  - b\r\ncorrect: 1\r\n");
    expect(quiz?.questions.map((q) => q.text)).toEqual(["One", "Two"]);
  });
});
