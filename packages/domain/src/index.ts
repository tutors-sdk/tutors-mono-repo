/**
 * The Tutors domain: plain TypeScript with no dependencies. Each bounded context is a subpath
 * export (@tutors/domain/course, /learning, /presence, /access, /quiz) and a namespace
 * here. The contexts are not flattened into one export list because course and learning each have
 * their own LearningRecord.
 */
export * as course from "./course/index.ts";
export * as learning from "./learning/index.ts";
export * as presence from "./presence/index.ts";
export * as access from "./access/index.ts";
export * as quiz from "./quiz/index.ts";
