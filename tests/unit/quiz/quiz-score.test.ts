import { describe, expect, it } from "vitest";
import { isQuizComplete, scoreQuiz } from "../../../packages/svelte/quiz/src/services/quiz-score";
import type { ParsedQuiz, QuizQuestion } from "../../../packages/svelte/quiz/src/types";

function question(id: string, correctIndex: number): QuizQuestion {
  return { id, type: "multiple-choice", text: `Question ${id}`, options: ["a", "b", "c"], correctIndex };
}

function quizOf(...questions: QuizQuestion[]): ParsedQuiz {
  return { title: null, timeLimit: null, questions };
}

const threeQuestions = quizOf(question("q1", 0), question("q2", 1), question("q3", 2));

describe("scoreQuiz", () => {
  it("counts every correct answer", () => {
    expect(scoreQuiz(threeQuestions, { q1: 0, q2: 1, q3: 2 })).toEqual({ correct: 3, total: 3, percentage: 100 });
  });

  it("counts a wrong answer as wrong", () => {
    expect(scoreQuiz(threeQuestions, { q1: 0, q2: 0, q3: 2 })).toEqual({ correct: 2, total: 3, percentage: 67 });
  });

  it("counts an unanswered question as wrong rather than excluding it", () => {
    expect(scoreQuiz(threeQuestions, { q1: 0 })).toEqual({ correct: 1, total: 3, percentage: 33 });
  });

  it("scores an empty answer set as zero", () => {
    expect(scoreQuiz(threeQuestions, {})).toEqual({ correct: 0, total: 3, percentage: 0 });
  });

  it("ignores answers for questions the quiz does not contain", () => {
    expect(scoreQuiz(threeQuestions, { q1: 0, q2: 1, q3: 2, q9: 0 })).toEqual({ correct: 3, total: 3, percentage: 100 });
  });

  it("returns zero percent for a quiz with no questions rather than dividing by zero", () => {
    expect(scoreQuiz(quizOf(), {})).toEqual({ correct: 0, total: 0, percentage: 0 });
  });

  it("rounds the percentage to a whole number", () => {
    const quiz = quizOf(question("q1", 0), question("q2", 0), question("q3", 0), question("q4", 0), question("q5", 0), question("q6", 0));
    expect(scoreQuiz(quiz, { q1: 0 }).percentage).toBe(17);
  });

  it("treats index 0 as a real answer, not as absent", () => {
    expect(scoreQuiz(quizOf(question("q1", 0)), { q1: 0 }).correct).toBe(1);
  });
});

describe("isQuizComplete", () => {
  it("is false while any question is unanswered", () => {
    expect(isQuizComplete(threeQuestions, { q1: 0, q2: 1 })).toBe(false);
  });

  it("is true once every question has an answer", () => {
    expect(isQuizComplete(threeQuestions, { q1: 0, q2: 0, q3: 0 })).toBe(true);
  });

  it("does not count an answer for an unknown question towards completion", () => {
    expect(isQuizComplete(threeQuestions, { q1: 0, q2: 1, q9: 0 })).toBe(false);
  });

  it("counts a selection of option 0 as answered", () => {
    expect(isQuizComplete(quizOf(question("q1", 2)), { q1: 0 })).toBe(true);
  });

  it("is true for a quiz with no questions", () => {
    expect(isQuizComplete(quizOf(), {})).toBe(true);
  });
});
