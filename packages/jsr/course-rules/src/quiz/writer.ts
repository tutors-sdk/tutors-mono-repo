import { extractQuizBlock } from "./content.ts";
import { parseQuizMarkdown } from "./parser.ts";
import type { QuestionType } from "./types.ts";

/** A quiz as a lecturer builds it in a form: what the writer turns into the markdown the reader reads. */
export interface QuizDraft {
  /** Shown above the questions; null or empty uses the learning object's title. */
  title?: string | null;
  /** Seconds allowed per question; null or 0 for untimed. */
  timeLimit?: number | null;
  questions: QuizDraftQuestion[];
}

export interface QuizDraftQuestion {
  type: QuestionType;
  /** Markdown: may hold fenced code blocks. */
  text: string;
  /** Markdown, one per answer; ignored for true-false, whose answers are always True and False. */
  options: string[];
  /** 0-based index into options; for true-false 0 is True and 1 is False. */
  correctIndex: number;
}

/** Why a draft cannot be written as a quiz the reader would show unchanged. */
export class QuizDraftError extends Error {
  constructor(
    readonly question: number | null,
    readonly problem: "no-questions" | "no-text" | "too-few-options" | "empty-option" | "answer-out-of-range" | "unreadable"
  ) {
    super(question === null ? problem : `question ${question}: ${problem}`);
  }
}

/** Text as the parser will read it back: \n line breaks, the ends trimmed. */
const clean = (text: string) => text.replace(/\r\n?/g, "\n").trim();

const QUOTE = /^["']|["']$/;

/** Text (already cleaned and non-empty) the parser would read back unchanged from a field's first line. */
const fitsOnOneLine = (text: string) => !text.includes("\n") && !QUOTE.test(text) && text !== "|" && text !== ">";

/** Every line indented, blank ones too, so the parser's dedent gives back each line exactly. */
const indent = (text: string, by: string) =>
  text
    .split("\n")
    .map((line) => by + line)
    .join("\n");

/** The longest run of backticks in any text, so the quiz fence can be longer than every fence inside it. */
function longestBacktickRun(texts: string[]): number {
  let longest = 0;
  for (const text of texts) for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return longest;
}

function questionMarkdown(question: QuizDraftQuestion, number: number): string {
  const text = clean(question.text);
  if (text === "") throw new QuizDraftError(number, "no-text");
  const lines = [fitsOnOneLine(text) ? `question: ${text}` : `question: |\n${indent(text, "  ")}`, `type: ${question.type}`];
  if (question.type === "true-false") {
    if (question.correctIndex !== 0 && question.correctIndex !== 1) throw new QuizDraftError(number, "answer-out-of-range");
    lines.push(`correct: ${question.correctIndex === 0 ? "true" : "false"}`);
    return lines.join("\n");
  }
  const options = question.options.map(clean);
  if (options.length < 2) throw new QuizDraftError(number, "too-few-options");
  if (options.some((option) => option === "")) throw new QuizDraftError(number, "empty-option");
  if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= options.length) {
    throw new QuizDraftError(number, "answer-out-of-range");
  }
  lines.push("options:");
  for (const option of options) lines.push(fitsOnOneLine(option) && !option.startsWith("- ") ? `  - ${option}` : `  - |\n${indent(option, "    ")}`);
  lines.push(`correct: ${question.correctIndex}`);
  return lines.join("\n");
}

/**
 * The fenced quiz block for a draft, in the format parseQuizMarkdown reads back to the same questions.
 * Throws QuizDraftError for a draft the reader could not show as built (Studio checks before writing).
 */
export function writeQuizBlock(draft: QuizDraft): string {
  if (draft.questions.length === 0) throw new QuizDraftError(null, "no-questions");
  const sections: string[] = [];
  const header: string[] = [];
  const title = draft.title?.replace(/\s+/g, " ").trim();
  if (title) header.push(`title: ${title}`);
  const limit = Math.round(draft.timeLimit ?? 0);
  if (limit > 0) header.push(`time_limit: ${limit}`);
  if (header.length > 0) sections.push(header.join("\n"));
  draft.questions.forEach((question, index) => sections.push(questionMarkdown(question, index + 1)));
  const texts = draft.questions.flatMap((question) => [question.text, ...question.options]);
  const fence = "`".repeat(Math.max(3, longestBacktickRun(texts) + 1));
  const block = `${fence}quiz\n${sections.join("\n---\n")}\n${fence}\n`;
  const unread = firstUnreadQuestion(block, draft);
  if (unread !== null) throw new QuizDraftError(unread, "unreadable");
  return block;
}

/**
 * The first question the reader would not read back as drafted, or null when all of them read back.
 * Catches the rare text the format cannot carry, such as a line of a question starting "options:".
 */
function firstUnreadQuestion(block: string, draft: QuizDraft): number | null {
  const parsed = parseQuizMarkdown(extractQuizBlock(block).quizSource ?? "");
  for (const [index, question] of draft.questions.entries()) {
    const read = parsed?.questions[index];
    const options = question.type === "true-false" ? ["True", "False"] : question.options.map(clean);
    const same =
      read !== undefined &&
      JSON.stringify([read.type, read.text, read.options, read.correctIndex]) === JSON.stringify([question.type, clean(question.text), options, question.correctIndex]);
    if (!same) return index + 1;
  }
  return null;
}

/** A whole quiz page: the heading the card shows, an optional introduction, then the quiz block. */
export function writeQuizPage(heading: string, introduction: string, draft: QuizDraft): string {
  const intro = introduction.trim();
  return `# ${heading.replace(/\s+/g, " ").trim()}\n\n${intro ? `${intro}\n\n` : ""}${writeQuizBlock(draft)}`;
}
