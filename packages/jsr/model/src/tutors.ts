/**
 * @tutors/tutors-model-lib is a facade for one major version: the course domain now lives in
 * @tutors/domain/course and markdown rendering in the @tutors/render-markdown adapter. Every
 * export this package had is still here, with the same name and behaviour.
 */
import { decorateCourseTree as decorateDomainCourseTree, decorateLoTree as decorateDomainLoTree, type Course, type Lo } from "@tutors/domain/course";
import { convertLoToHtml } from "@tutors/render-markdown";

export * from "@tutors/domain/course";
export { initHighlighter, markdownIt, loadMath, mayContainMath, convertMdToHtml, convertLabToHtml, convertNoteToHtml, convertLoSummaryToHtml, convertLoToHtml, filter } from "@tutors/render-markdown";

/** Build the course tree and render every learning object's markdown, as this package always did. */
export function decorateCourseTree(course: Course, courseId: string = "", courseUrl = "") {
  decorateDomainCourseTree(course, courseId, courseUrl, { render: convertLoToHtml });
}

export function decorateLoTree(course: Course, lo: Lo) {
  decorateDomainLoTree(course, lo, convertLoToHtml);
}
