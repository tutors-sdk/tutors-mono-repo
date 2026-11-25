import type { Course, Lo } from "@tutors/domain/course";

/** Turns markdown into HTML. The markdown-it pipeline, Shiki and KaTeX live behind this port. */
export interface ContentRenderer {
  /** Render a learning object's body and summary in place, resolving relative links against the course site. */
  renderLo(course: Course, lo: Lo, protocol?: string): void;
  /** Render only the one-line summary in place; the body waits until the learning object is opened. */
  renderSummary(lo: Lo): void;
  renderMarkdown(md: string): string;
  /** True when text looks like it holds maths, so the maths plugin is loaded before rendering. */
  mayContainMath(text: string): boolean;
  loadMath(): Promise<void>;
}
