import type { QuizContent } from "../types.ts";

/** Opening fence of a quiz block: three or more backticks (or tildes) then `quiz`. */
const OPEN_FENCE = /^\s*(`{3,}|~{3,})\s*quiz\s*$/i;

/**
 * Split a quiz learning object's markdown into its prose and its quiz
 * definition.
 *
 * A quiz learning object is an ordinary Tutors markdown document that happens
 * to contain one fenced `quiz` block:
 *
 *     # Recursion Check
 *
 *     Answer these before starting the lab.
 *
 *     ```quiz
 *     title: Recursion Check
 *     ---
 *     question: What does a base case do?
 *     ...
 *     ```
 *
 * Only the first quiz fence is taken; a second one is left in the prose, where
 * it renders as a visible code block so the author can see it was ignored. An
 * unterminated fence runs to the end of the document.
 */
export function extractQuizBlock(contentMd: string): QuizContent {
  const prose: string[] = [];
  const quiz: string[] = [];
  let openedWith: string | null = null;
  let found = false;

  for (const line of contentMd.split("\n")) {
    if (openedWith !== null) {
      // Inside the quiz fence. A closing fence is the same character repeated
      // at least as many times as the opening one, and nothing else.
      if (new RegExp(`^\\s*${openedWith[0]}{${openedWith.length},}\\s*$`).test(line)) {
        openedWith = null;
      } else {
        quiz.push(line);
      }
      continue;
    }

    const open = found ? null : line.match(OPEN_FENCE);
    if (open) {
      openedWith = open[1];
      found = true;
    } else {
      prose.push(line);
    }
  }

  return {
    prose: prose.join("\n").trim(),
    quizSource: found ? quiz.join("\n") : null
  };
}
