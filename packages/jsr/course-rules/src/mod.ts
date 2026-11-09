/**
 * @tutors/course-rules: the course validator's rules core. Pure, with no file-system access of its own;
 * a shell hands it a FileSystemPort. The CLI (`tutors validate`), Tutors Studio, the reader's /create
 * wizard and CI are all adapters around these same functions.
 *
 * @module
 */
export type { DirEntry, FileSystemPort } from "./ports.ts";
export { joinPath } from "./ports.ts";
export type { Finding, RuleId, RuleInfo, Severity } from "./finding.ts";
export { ruleCatalogue } from "./finding.ts";
export { kindName, messages } from "./messages.ts";
export type { CourseFile, CourseNode, CourseTree } from "./tree.ts";
export { buildCourseTree, kindOf } from "./tree.ts";
export { checkTree, slugify, sortFindings, validate } from "./validate.ts";
export { MemoryFileSystem } from "./adapters/memory-fs.ts";
