import { describe, it, expect } from "vitest";
import { extractQuizBlock } from "../../../packages/svelte/quiz/src/services/quiz-content";

const DOC = `# Recursion Check

Answer these before the lab.

\`\`\`quiz
title: Recursion
---
question: What does a base case do?
\`\`\`

Good luck.`;

describe("extractQuizBlock", () => {
  it("splits prose from the quiz definition", () => {
    const { prose, quizSource } = extractQuizBlock(DOC);
    expect(quizSource).toBe("title: Recursion\n---\nquestion: What does a base case do?");
    expect(prose).toContain("# Recursion Check");
    expect(prose).toContain("Answer these before the lab.");
    expect(prose).toContain("Good luck.");
  });

  it("excludes the fence markers from both halves", () => {
    const { prose, quizSource } = extractQuizBlock(DOC);
    expect(prose).not.toContain("```");
    expect(quizSource).not.toContain("```");
  });

  it("returns a null quizSource when the document has no quiz block", () => {
    const { prose, quizSource } = extractQuizBlock("# Just A Note\n\nNothing here.");
    expect(quizSource).toBeNull();
    expect(prose).toBe("# Just A Note\n\nNothing here.");
  });

  it("returns empty content for an empty document", () => {
    expect(extractQuizBlock("")).toEqual({ prose: "", quizSource: null });
  });

  it("accepts tilde fences", () => {
    const { quizSource } = extractQuizBlock("intro\n~~~quiz\nquestion: Why?\n~~~\n");
    expect(quizSource).toBe("question: Why?");
  });

  it("accepts more than three fence characters", () => {
    const { quizSource } = extractQuizBlock("````quiz\nquestion: Why?\n````");
    expect(quizSource).toBe("question: Why?");
  });

  it("leaves other fenced blocks in the prose", () => {
    const { prose, quizSource } = extractQuizBlock("```ts\nconst a = 1;\n```\n\n```quiz\nquestion: Why?\n```");
    expect(prose).toContain("const a = 1;");
    expect(prose).toContain("```ts");
    expect(quizSource).toBe("question: Why?");
  });

  it("keeps a nested code fence inside the quiz block", () => {
    // A longer outer fence lets a question embed a code sample.
    const { quizSource } = extractQuizBlock("````quiz\nquestion: What does this print?\n```js\nx()\n```\n````");
    expect(quizSource).toContain("```js");
    expect(quizSource).toContain("x()");
  });

  it("runs an unterminated fence to the end of the document", () => {
    const { prose, quizSource } = extractQuizBlock("intro\n```quiz\nquestion: Why?");
    expect(prose).toBe("intro");
    expect(quizSource).toBe("question: Why?");
  });

  it("takes only the first quiz block and leaves the second in the prose", () => {
    const { prose, quizSource } = extractQuizBlock("```quiz\nquestion: First?\n```\n\n```quiz\nquestion: Second?\n```");
    expect(quizSource).toBe("question: First?");
    expect(prose).toContain("question: Second?");
  });

  it("ignores a fence whose info string merely starts with quiz", () => {
    const { quizSource } = extractQuizBlock("```quizzical\nnot a quiz\n```");
    expect(quizSource).toBeNull();
  });
});
