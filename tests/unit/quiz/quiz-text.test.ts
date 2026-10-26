import { describe, it, expect } from "vitest";
import { isBlockQuizText, quizTextToHtml } from "../../../packages/svelte/ui-components/src/quiz/quiz-text";

describe("quiz text rendering", () => {
  it("treats text that spans lines as a block", () => {
    expect(isBlockQuizText("one line")).toBe(false);
    expect(isBlockQuizText("first\nsecond")).toBe(true);
  });

  it("renders one-line text inline", () => {
    expect(quizTextToHtml("Use **const**", "ayu-dark")).toBe("Use <strong>const</strong>");
  });

  it("renders text that spans lines as paragraphs", () => {
    expect(quizTextToHtml("First\n\nSecond", "ayu-dark")).toBe("<p>First</p>\n<p>Second</p>\n");
  });
});
