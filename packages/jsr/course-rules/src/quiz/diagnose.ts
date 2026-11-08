import { extractQuizBlock } from "./content.ts";
import type { QuestionProblem } from "./parser.ts";
import { extractField, hasQuestionText, readQuestion, splitSections } from "./parser.ts";

/** Something in a quiz the reader would not show as the lecturer wrote it. */
export type QuizDiagnosis =
  | { kind: "no-block" }
  | { kind: "empty-block" }
  | { kind: "question"; number: number; excerpt: string; problem: QuestionProblem; optionCount?: number; answer?: string }
  | { kind: "second-block" }
  | { kind: "time-limit"; value: string };

const OPEN_FENCE = /^\s*(`{3,}|~{3,})\s*quiz\s*$/i;

/** The question's first line of text, cut to a length a lecturer can recognise it by; empty when it has none. */
function excerptOf(section: string): string {
  const lines = section.split("\n");
  const at = lines.findIndex((line) => /^(question|text):/i.test(line));
  if (at < 0) return "";
  const first = lines[at].replace(/^(question|text):\s*[|>]?/i, "").trim() || (lines[at + 1] ?? "").trim();
  return first.length > 60 ? `${first.slice(0, 57)}...` : first;
}

/**
 * Reads a quiz learning object's markdown the way the reader does and lists everything it would
 * drop or ignore: a missing quiz block, each question left out and why, a second quiz block, a time
 * limit that is not a whole number of seconds. An empty list means students see the quiz as written.
 */
export function diagnoseQuiz(contentMd: string): QuizDiagnosis[] {
  const { prose, quizSource } = extractQuizBlock(contentMd.replace(/\r\n?/g, "\n"));
  if (quizSource === null) return [{ kind: "no-block" }];
  const found: QuizDiagnosis[] = [];
  const sections = splitSections(quizSource)
    .map((section) => section.trim())
    .filter(Boolean);
  if (sections.length === 0) found.push({ kind: "empty-block" });
  const header = sections.length > 0 && !hasQuestionText(sections[0]) ? sections[0] : "";
  const questions = header ? sections.slice(1) : sections;
  if (header && questions.length === 0) found.push({ kind: "empty-block" });
  questions.forEach((section, index) => {
    const read = readQuestion(section, index);
    if ("problem" in read) found.push({ kind: "question", number: index + 1, excerpt: excerptOf(section), ...read });
  });
  const limit = extractField(header, "time_limit");
  if (limit !== null && !(/^\d+$/.test(limit) && Number(limit) > 0)) found.push({ kind: "time-limit", value: limit });
  if (prose.split("\n").some((line) => OPEN_FENCE.test(line))) found.push({ kind: "second-block" });
  return found;
}
