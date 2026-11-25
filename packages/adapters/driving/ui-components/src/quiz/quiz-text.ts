import { convertMdToHtml, markdownIt } from "@tutors/tutors-model-lib";
import { sanitizeHtml } from "@tutors/ui-primitives/utils/sanitize";

/** True when quiz text spans lines, so it may hold paragraphs or a fenced code block. */
export function isBlockQuizText(md: string): boolean {
  return md.includes("\n");
}

/**
 * Render a question's or an option's text. One-line text renders inline, as it
 * always has; text that spans lines renders as a markdown block through the
 * same renderer and code theme as lab steps, so a fenced code block is
 * highlighted the way the labs highlight it.
 */
export function quizTextToHtml(md: string, codeTheme: string): string {
  return sanitizeHtml(isBlockQuizText(md) ? convertMdToHtml(md, codeTheme) : markdownIt.renderInline(md));
}
