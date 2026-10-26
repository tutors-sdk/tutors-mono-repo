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
 * A question's text runs from `question:` to the next field, and an option is
 * a `- ` item plus the lines indented under it, so either can carry a fenced
 * code block. A `---` or `field:` line inside a code fence is code, never a
 * separator or a field.
 *
 * `correct` is a 0-based index for multiple-choice; for true-false it accepts
 * `true`/`false` (or `0`/`1`). A question missing `correct`, or naming an
 * option that does not exist, is rejected rather than defaulting to the first
 * option — a malformed quiz should surface as invalid, not quietly mark the
 * wrong answer correct. Returns null if no valid question is found.
 */
export function parseQuizMarkdown(source: string): ParsedQuiz | null {
  // A file saved on Windows ends lines with \r\n; read it as \n so `---` still separates sections.
  const sections = splitSections(source.replace(/\r\n?/g, "\n"))
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
  return extractBlockField(section, "question") !== null || extractBlockField(section, "text") !== null;
}

function parseQuestionSection(section: string, index: number): QuizQuestion | null {
  // `question:` is the documented key; `text:` is accepted as an alias.
  const text = extractBlockField(section, "question") ?? extractBlockField(section, "text");
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

/** Opening or closing line of a code fence, including one opened on an option's dash line. */
const FENCE = /^\s*(?:-\s+)?(`{3,}|~{3,})/;

/** The keys a field line can start with; any other `name:` line is ordinary text. */
const FIELD = /^(title|time_limit|question|text|type|options|correct):(.*)$/i;

/**
 * Tracks whether the lines read so far have left a code fence open. `step`
 * takes each line in turn; `open` is true between a fence's opening line and
 * its closing line.
 */
class FenceTracker {
  private fence: string | null = null;

  get open(): boolean {
    return this.fence !== null;
  }

  /** Returns true when the line is part of a fence, its opening and closing lines included. */
  step(line: string): boolean {
    const fence = line.match(FENCE)?.[1];
    if (this.fence === null) {
      if (fence) this.fence = fence;
      return fence !== undefined;
    }
    if (fence && fence[0] === this.fence[0] && fence.length >= this.fence.length && line.trim() === fence) this.fence = null;
    return true;
  }
}

/** Split on lines containing only `---`, except inside a code fence. */
function splitSections(source: string): string[] {
  const sections: string[][] = [[]];
  const fences = new FenceTracker();
  for (const line of source.split("\n")) {
    if (!fences.step(line) && line === "---") sections.push([]);
    else sections[sections.length - 1].push(line);
  }
  return sections.map((lines) => lines.join("\n"));
}

/**
 * The lines of a section grouped by field: each field line (outside a code
 * fence) starts a group holding its own value and every line after it up to
 * the next field line.
 */
function fieldsOf(section: string): Map<string, { value: string; lines: string[] }> {
  const fields = new Map<string, { value: string; lines: string[] }>();
  const fences = new FenceTracker();
  let current: { value: string; lines: string[] } | null = null;
  for (const line of section.split("\n")) {
    // `options:` has always been accepted indented; other fields start a line.
    const match = fences.step(line) ? null : (line.match(FIELD) ?? line.trimStart().match(/^(options):(.*)$/i));
    if (match) {
      current = { value: match[2].trim(), lines: [] };
      const key = match[1].toLowerCase();
      if (!fields.has(key)) fields.set(key, current);
    } else {
      current?.lines.push(line);
    }
  }
  return fields;
}

/** A one-line field's value, as it has always been read. */
function extractField(section: string, key: string): string | null {
  const value = fieldsOf(section).get(key)?.value;
  return value ? stripQuotes(value) : null;
}

/** A field whose value may continue on the lines after it, such as a question with a code block. */
function extractBlockField(section: string, key: string): string | null {
  const field = fieldsOf(section).get(key);
  if (!field) return null;
  return joinBlock(field.value, field.lines) || null;
}

function extractListField(section: string, key: string): string[] {
  const lines = fieldsOf(section).get(key)?.lines ?? [];
  const items: { first: string; rest: string[]; indent: number }[] = [];
  const fences = new FenceTracker();

  for (const line of lines) {
    const current = items[items.length - 1];
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    if (current && (fences.open || indent > current.indent || (!trimmed && (current.first || current.rest.length)))) {
      // Inside a code fence, or indented under the item: it continues the item.
      fences.step(line);
      current.rest.push(line);
    } else if (!trimmed) {
      continue;
    } else if (trimmed.startsWith("- ")) {
      const first = trimmed.slice(2).trim();
      fences.step(first);
      items.push({ first, rest: [], indent });
    } else if (!trimmed.includes(":")) {
      fences.step(trimmed);
      items.push({ first: trimmed, rest: [], indent });
    } else {
      break;
    }
  }

  return items.map((item) => joinBlock(item.first, item.rest));
}

/**
 * Join a field's first-line value with its continuation lines. A lone `|`
 * (the YAML habit) is dropped, continuation lines lose their common
 * indentation, and quotes around the first line are stripped as they always
 * were for a one-line value.
 */
function joinBlock(first: string, rest: string[]): string {
  const head = first === "|" || first === ">" ? "" : stripQuotes(first);
  return `${head}\n${dedent(rest)}`.trim();
}

function dedent(lines: string[]): string {
  const indents = lines.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length);
  const common = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((line) => line.slice(common))
    .join("\n")
    .trimEnd();
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}
