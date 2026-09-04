import type { QuizQuestion, QuestionType } from "../types.ts";

export interface ParsedQuiz {
  title: string;
  timeLimit: number | null;
  questions: QuizQuestion[];
}

/**
 * Parse a fenced `quiz` markdown block into a quiz definition.
 *
 * Format: sections separated by lines containing only `---`. The first section
 * is a header (`title:`, `time_limit:`); each remaining section is a question:
 *
 *   title: My Quiz
 *   time_limit: 30
 *   ---
 *   type: multiple-choice
 *   text: Which keyword is block-scoped and non-reassignable?
 *   options:
 *     - var
 *     - let
 *     - const
 *   correct: 2
 *
 * `correct` is a 0-based index for multiple-choice; for true-false it accepts
 * `true`/`false` (or `0`/`1`). Returns null if no valid question is found.
 */
export function parseQuizMarkdown(source: string): ParsedQuiz | null {
  const sections = source
    .split(/^---$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sections.length === 0) return null;

  const headerSection = sections[0];
  const title = extractField(headerSection, "title") ?? "Untitled Quiz";
  const timeLimitStr = extractField(headerSection, "time_limit");
  const parsedLimit = timeLimitStr ? parseInt(timeLimitStr, 10) : NaN;
  const timeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

  // If the header block itself carries question fields, treat every section as
  // a question (no dedicated header); otherwise the first section is the header.
  const headerIsQuestion = headerSection.includes("type:") && headerSection.includes("text:");
  const questionSections = headerIsQuestion ? sections : sections.slice(1);

  const questions: QuizQuestion[] = [];
  for (let i = 0; i < questionSections.length; i++) {
    const question = parseQuestionSection(questionSections[i], questions.length);
    if (question) questions.push(question);
  }

  if (questions.length === 0) return null;

  return { title, timeLimit, questions };
}

function parseQuestionSection(section: string, index: number): QuizQuestion | null {
  const text = extractField(section, "text");
  if (!text) return null;

  const typeStr = extractField(section, "type");
  const type: QuestionType = typeStr === "true-false" ? "true-false" : "multiple-choice";
  const correctStr = extractField(section, "correct");

  const options = type === "true-false" ? ["True", "False"] : extractListField(section, "options");
  if (options.length < 2) return null;

  const correctIndex = resolveCorrectIndex(type, correctStr);
  // Reject out-of-range answers rather than silently clamping — a malformed
  // quiz should surface as invalid, not quietly mark the wrong option correct.
  if (correctIndex < 0 || correctIndex >= options.length) return null;

  return {
    id: `q${index + 1}`,
    type,
    text,
    options,
    correctIndex
  };
}

function resolveCorrectIndex(type: QuestionType, correctStr: string | null): number {
  if (correctStr === null) return 0;
  if (type === "true-false") {
    return correctStr.toLowerCase() === "false" || correctStr === "1" ? 1 : 0;
  }
  const parsed = parseInt(correctStr, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractField(section: string, key: string): string | null {
  const regex = new RegExp(`^${key}:\\s*(.+)$`, "mi");
  const match = section.match(regex);
  return match ? stripQuotes(match[1].trim()) : null;
}

function extractListField(section: string, key: string): string[] {
  const lines = section.split("\n");
  const items: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(`${key}:`)) {
      inList = true;
      continue;
    }
    if (!inList) continue;

    if (trimmed.startsWith("- ")) {
      items.push(stripQuotes(trimmed.slice(2).trim()));
    } else if (trimmed && !trimmed.includes(":")) {
      items.push(stripQuotes(trimmed));
    } else {
      break;
    }
  }

  return items;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}
