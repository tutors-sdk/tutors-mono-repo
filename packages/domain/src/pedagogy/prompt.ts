import type { TeachingContext } from "./types.ts";

/** The rule every assistant follows: teach the course as the course teaches it, and say when it does not cover the question. */
export const TUTOR_INSTRUCTIONS =
  "You are a tutor for this course. Answer from the course material, in the course's own terms. " +
  "When the material does not cover the question, say so rather than guessing.";

/** The prompt a tutor assistant gets for a question asked in `context`. */
export function tutorPrompt(context: TeachingContext, question: string): string {
  const where = context.lo ? `the ${context.lo.type} "${context.lo.title}" in the course "${context.course.title}"` : `the course "${context.course.title}"`;
  const material = context.lo?.contentMd ? `\n\nMaterial:\n${context.lo.contentMd}` : "";
  return `${TUTOR_INSTRUCTIONS}\n\nThe learner is reading ${where}.${material}\n\nQuestion: ${question.trim()}`;
}
