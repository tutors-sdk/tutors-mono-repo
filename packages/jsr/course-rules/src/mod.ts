/**
 * @tutors/course-rules: the course validator's rules core. Pure, with no file-system access of its own;
 * a shell hands it a FileSystemPort. The CLI (`tutors validate`), Tutors Studio, the reader's /create
 * wizard and CI are all adapters around these same functions.
 *
 * @module
 */
export type { DiagramCheck, DiagramPort, DirEntry, FileSystemPort, ValidateOptions } from "./ports.ts";
export { joinPath } from "./ports.ts";
export type { FileOp, Finding, RuleId, RuleInfo, Severity } from "./finding.ts";
export { ruleCatalogue } from "./finding.ts";
export { kindName, messages } from "./messages.ts";
export type { CourseFile, CourseNode, CourseTree } from "./tree.ts";
export { buildCourseTree, kindOf } from "./tree.ts";
export { checkTree, slugify, sortFindings, validate } from "./validate.ts";
export { fileSlug, IMAGE_LIMIT_BYTES, titleOf } from "./warnings.ts";
export type { FixOutcome } from "./fix.ts";
export { applyFixes, fixCourse, planFixes } from "./fix.ts";
export type { ImportFile, ShapeItem, ShapeKind, ShapeProposal, ShapeTopic } from "./shape.ts";
export { linkOf, proposeShape, weekOf } from "./shape.ts";
export { netlifyToml } from "./templates.ts";
export { MemoryFileSystem } from "./adapters/memory-fs.ts";
export type { MermaidParser } from "./adapters/mermaid.ts";
export { mermaidDiagrams } from "./adapters/mermaid.ts";
export { mermaidBlocks } from "./rich.ts";
export type { ExitCode, ReportFormat } from "./report.ts";
export { exitCodeFor, jsonReport, report, sarifReport, textReport } from "./report.ts";
export { rulesVersion } from "./version.ts";
