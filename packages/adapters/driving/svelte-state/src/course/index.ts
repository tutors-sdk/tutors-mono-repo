/**
 * Re-exports course service, utilities and types for easier imports
 * @module
 */

export { courseService, CourseNotFoundError, setCourseNotFoundHandler, setCourseUnreachableHandler } from "./services/course.svelte.ts";
export { setCompanionIconRegistrar, decorateCourseTree, determineCourseUrl, readerDecoration } from "./services/lo-tree.ts";
export { LiveLab } from "./services/live-lab.ts";
export { LiveNotebook } from "./services/live-notebook.ts";
export type { NotebookService } from "./types.ts";
