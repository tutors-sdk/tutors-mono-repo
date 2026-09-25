import type { ParsedQuiz, QuestionType, QuizQuestion } from "../types.ts";

/**
 * Parse the body of a fenced `quiz` block into a quiz definition.
 *
 * Format: sections separated by lines containing only `---`. An optional first
 * section is a header (`title:`, `time_limit:`); each remaining section is a
 * question:
 *
 *   title: My Quiz
 *   time_limit: 30
 *   ---
 *   question: Which keyword is block-scoped and non-reassignable?
 *   type: multiple-choice
 *   options:
 *     - var
 *     - let
 *     - const
 *   correct: 2
 *
 * `correct` is a 0-based index for multiple-choice; for true-false it accepts
 * `true`/`false` (or `0`/`1`). A question missing `correct`, or naming an
 * option that does not exist, is rejected rather than defaulting to the first
 * option — a malformed quiz should surface as invalid, not quietly mark the
 * wrong answer correct. Returns null if no valid question is found.
 */
export function parseQuizMarkdown(source: string): ParsedQuiz | null {
  const sections = source
    .split(/^---$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sections.length === 0) return null;

  // A leading section that carries question text is a question, not a header.
  const headerSection = hasQuestionText(sections[0]) ? "" : sections[0];
  const questionSections = headerSection ? sections.slice(1) : sections;

  const questions: QuizQuestion[] = [];
  for (const section of questionSections) {
    const question = parseQuestionSection(section, questions.length);
    if (question) questions.push(question);
  }
  if (questions.length === 0) return null;

  const timeLimitStr = extractField(headerSection, "time_limit");
  const parsedLimit = timeLimitStr !== null && /^\d+$/.test(timeLimitStr) ? parseInt(timeLimitStr, 10) : NaN;

  return {
    title: extractField(headerSection, "title"),
    timeLimit: parsedLimit > 0 ? parsedLimit : null,
    questions
  };
}

function hasQuestionText(section: string): boolean {
  return extractField(section, "question") !== null || extractField(section, "text") !== null;
}

function parseQuestionSection(section: string, index: number): QuizQuestion | null {
  // `question:` is the documented key; `text:` is accepted as an alias.
  const text = extractField(section, "question") ?? extractField(section, "text");
  if (!text) return null;

  const type: QuestionType = extractField(section, "type") === "true-false" ? "true-false" : "multiple-choice";
  const options = type === "true-false" ? ["True", "False"] : extractListField(section, "options");
  if (options.length < 2) return null;

  const correctIndex = resolveCorrectIndex(type, extractField(section, "correct"));
  if (correctIndex < 0 || correctIndex >= options.length) return null;

  return { id: `q${index + 1}`, type, text, options, correctIndex };
}

/** Returns -1 for a missing or uninterpretable answer, so the caller rejects the question. */
function resolveCorrectIndex(type: QuestionType, correct: string | null): number {
  if (correct === null) return -1;
  if (type === "true-false") {
    const value = correct.toLowerCase();
    if (value === "true" || value === "0") return 0;
    if (value === "false" || value === "1") return 1;
    return -1;
  }
  return /^\d+$/.test(correct) ? parseInt(correct, 10) : -1;
}

function extractField(section: string, key: string): string | null {
  const match = section.match(new RegExp(`^${escapeRegex(key)}:\\s*(.+)$`, "mi"));
  return match ? stripQuotes(match[1].trim()) : null;
}

function extractListField(section: string, key: string): string[] {
  const items: string[] = [];
  let inList = false;

  for (const line of section.split("\n")) {
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}
