import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extractQuizBlock } from "../../../packages/jsr/course-rules/src/quiz/content";
import { parseQuizMarkdown } from "../../../packages/jsr/course-rules/src/quiz/parser";
import { QuizDraftError, writeQuizBlock, writeQuizPage, type QuizDraft } from "../../../packages/jsr/course-rules/src/quiz/writer";

/** What the reader shows of typed text: \n line breaks, the ends trimmed. */
const normal = (text: string) => text.replace(/\r\n?/g, "\n").trim();
const readBack = (markdown: string) => parseQuizMarkdown(extractQuizBlock(markdown).quizSource ?? "");

const draft: QuizDraft = {
  title: "Recursion check",
  timeLimit: 30,
  questions: [
    { type: "multiple-choice", text: "What does a base case do?", options: ["Ends the recursion", "Starts it"], correctIndex: 0 },
    { type: "true-false", text: "Every recursive function needs a base case.", options: [], correctIndex: 0 },
    { type: "true-false", text: "Recursion is always faster.", options: [], correctIndex: 1 }
  ]
};

describe("writeQuizBlock", () => {
  it("writes the format the reader documents", () => {
    expect(writeQuizBlock(draft)).toBe(
      [
        "```quiz",
        "title: Recursion check",
        "time_limit: 30",
        "---",
        "question: What does a base case do?",
        "type: multiple-choice",
        "options:",
        "  - Ends the recursion",
        "  - Starts it",
        "correct: 0",
        "---",
        "question: Every recursive function needs a base case.",
        "type: true-false",
        "correct: true",
        "---",
        "question: Recursion is always faster.",
        "type: true-false",
        "correct: false",
        "```",
        ""
      ].join("\n")
    );
  });

  it("reads back to the same quiz", () => {
    const quiz = readBack(writeQuizBlock(draft))!;
    expect(quiz.title).toBe("Recursion check");
    expect(quiz.timeLimit).toBe(30);
    expect(quiz.questions.map((q) => [q.type, q.text, q.options, q.correctIndex])).toEqual([
      ["multiple-choice", "What does a base case do?", ["Ends the recursion", "Starts it"], 0],
      ["true-false", "Every recursive function needs a base case.", ["True", "False"], 0],
      ["true-false", "Recursion is always faster.", ["True", "False"], 1]
    ]);
  });

  it("leaves out the header when there is no title or time limit, and rounds the limit", () => {
    const one = { questions: [draft.questions[0]] };
    expect(writeQuizBlock(one).split("\n")[1]).toBe("question: What does a base case do?");
    expect(writeQuizBlock({ ...one, title: "  ", timeLimit: 0 }).split("\n")[1]).toBe("question: What does a base case do?");
    expect(
      writeQuizBlock({ ...one, title: "A\n  quiz", timeLimit: 12.6 })
        .split("\n")
        .slice(1, 3)
    ).toEqual(["title: A quiz", "time_limit: 13"]);
  });

  it("carries code blocks in questions and answers inside a longer fence", () => {
    const code: QuizDraft = {
      questions: [
        {
          type: "multiple-choice",
          text: "What does this print?\n\n```js\nconsole.log(1 + 1);\n```",
          options: ["`2`", "```js\n'11'\n```", '"nothing"'],
          correctIndex: 0
        }
      ]
    };
    const block = writeQuizBlock(code);
    expect(block.startsWith("````quiz\n")).toBe(true);
    expect(block.endsWith("\n````\n")).toBe(true);
    expect(block).toContain("question: |\n  What does this print?\n  \n  ```js");
    expect(block).toContain('  - |\n    "nothing"');
    const quiz = readBack(block)!;
    expect(quiz.questions[0].text).toBe(code.questions[0].text);
    expect(quiz.questions[0].options).toEqual(code.questions[0].options);
  });

  it("keeps a quote inside one-line text, and a negative time limit means untimed", () => {
    const quiz: QuizDraft = { timeLimit: -5, questions: [{ type: "multiple-choice", text: "It's which?", options: ["it's this", "that"], correctIndex: 0 }] };
    expect(writeQuizBlock(quiz).split("\n").slice(1, 6)).toEqual(["question: It's which?", "type: multiple-choice", "options:", "  - it's this", "  - that"]);
  });

  it("keeps whitespace-only lines inside a question as they were typed", () => {
    const text = "Line one\n   \nLine three";
    expect(readBack(writeQuizBlock({ questions: [{ type: "true-false", text, options: [], correctIndex: 0 }] }))!.questions[0].text).toBe(text);
  });

  it("writes an answer that looks like a list item as a block", () => {
    const quiz: QuizDraft = { questions: [{ type: "multiple-choice", text: "Pick", options: ["- a dash", "b"], correctIndex: 1 }] };
    expect(writeQuizBlock(quiz)).toContain("  - |\n    - a dash");
    expect(readBack(writeQuizBlock(quiz))!.questions[0].options).toEqual(["- a dash", "b"]);
  });

  it.each([
    [{ questions: [] }, null, "no-questions"],
    [{ questions: [{ type: "multiple-choice", text: " ", options: ["a", "b"], correctIndex: 0 }] }, 1, "no-text"],
    [{ questions: [{ type: "multiple-choice", text: "Q", options: ["a"], correctIndex: 0 }] }, 1, "too-few-options"],
    [{ questions: [{ type: "multiple-choice", text: "Q", options: ["a", " "], correctIndex: 0 }] }, 1, "empty-option"],
    [{ questions: [{ type: "multiple-choice", text: "Q", options: ["a", "b"], correctIndex: 2 }] }, 1, "answer-out-of-range"],
    [{ questions: [{ type: "multiple-choice", text: "Q", options: ["a", "b"], correctIndex: -1 }] }, 1, "answer-out-of-range"],
    [{ questions: [{ type: "multiple-choice", text: "Q", options: ["a", "b"], correctIndex: 0.5 }] }, 1, "answer-out-of-range"],
    [{ questions: [draft.questions[0], { type: "true-false", text: "Q", options: [], correctIndex: 2 }] }, 2, "answer-out-of-range"],
    [{ questions: [{ type: "multiple-choice", text: "Q\noptions: x", options: ["a", "b"], correctIndex: 0 }] }, 1, "unreadable"]
  ] as [QuizDraft, number | null, string][])("refuses a draft the reader could not show as built (%#)", (bad, question, problem) => {
    let error: unknown;
    try {
      writeQuizBlock(bad);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(QuizDraftError);
    expect((error as QuizDraftError).question).toBe(question);
    expect((error as QuizDraftError).problem).toBe(problem);
    expect((error as QuizDraftError).message).toBe(question === null ? problem : `question ${question}: ${problem}`);
  });

  it("reads back whatever text a lecturer types, line breaks and symbols included", () => {
    const line = fc.string({ minLength: 1, maxLength: 30, unit: "binary-ascii" }).filter((text) => text.trim() !== "" && !/^\s*options:/im.test(text));
    const question = fc.oneof(
      fc.record({ type: fc.constant("true-false" as const), text: line, options: fc.constant([]), correctIndex: fc.integer({ min: 0, max: 1 }) }),
      fc
        .array(line, { minLength: 2, maxLength: 5 })
        .chain((options) =>
          fc.record({ type: fc.constant("multiple-choice" as const), text: line, options: fc.constant(options), correctIndex: fc.integer({ min: 0, max: options.length - 1 }) })
        )
    );
    fc.assert(
      fc.property(fc.array(question, { minLength: 1, maxLength: 4 }), (questions) => {
        const quiz = readBack(writeQuizBlock({ questions }))!;
        return (
          quiz.questions.length === questions.length &&
          quiz.questions.every(
            (read, at) =>
              read.text === normal(questions[at].text) &&
              read.correctIndex === questions[at].correctIndex &&
              (questions[at].type === "true-false" || read.options.join("\u0000") === questions[at].options.map(normal).join("\u0000"))
          )
        );
      }),
      { numRuns: 1000 }
    );
  });
});

describe("writeQuizPage", () => {
  it("puts the title and introduction above the quiz", () => {
    const page = writeQuizPage(" Week  3\nquiz ", "Answer before the lab.", { questions: [draft.questions[0]] });
    expect(page.startsWith("# Week 3 quiz\n\nAnswer before the lab.\n\n```quiz\n")).toBe(true);
    expect(extractQuizBlock(page).prose).toBe("# Week 3 quiz\n\nAnswer before the lab.");
  });

  it("leaves out an empty introduction", () => {
    expect(writeQuizPage("Quiz", "  ", { questions: [draft.questions[0]] }).startsWith("# Quiz\n\n```quiz\n")).toBe(true);
  });
});
