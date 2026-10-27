import type { QuizContent } from "../types.ts";

/** Opening fence of a quiz block: three or more backticks (or tildes) then `quiz`. */
const OPEN_FENCE = /^\s*(`{3,}|~{3,})\s*quiz\s*$/i;

/** Any fence line, with or without a language after it, including one opened on an option's dash line. */
const CODE_FENCE = /^\s*(?:-\s+)?(`{3,}|~{3,})/;

/** A closing fence is the opening character repeated at least as many times, and nothing else. */
function closes(line: string, fence: string): boolean {
  return new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line);
}

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
 *
 * A code fence inside the quiz stays inside it when it cannot be mistaken for
 * the quiz's closing fence: it names a language (```js), uses the other fence
 * character, or is shorter than the quiz fence (a ````quiz block holds plain
 * ``` fences).
 */
export function extractQuizBlock(contentMd: string): QuizContent {
  const prose: string[] = [];
  const quiz: string[] = [];
  let openedWith: string | null = null;
  let nested: string | null = null;
  let found = false;

  for (const line of contentMd.split("\n")) {
    if (openedWith !== null) {
      if (nested !== null) {
        // Inside a code fence within the quiz: only its own closing fence ends it.
        if (closes(line, nested)) nested = null;
        quiz.push(line);
      } else if (closes(line, openedWith)) {
        openedWith = null;
      } else {
        nested = line.match(CODE_FENCE)?.[1] ?? null;
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
