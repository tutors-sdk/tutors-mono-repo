import type { Course, Lo } from "../course/types/index.ts";

/** Where a learner is when they ask: the course and, when they are inside one, the learning object. */
export type TeachingContext = {
  course: Pick<Course, "courseId" | "title">;
  lo?: Pick<Lo, "route" | "title" | "type" | "contentMd">;
};

export type TutorQuestion = {
  context: TeachingContext;
  question: string;
};

export type TutorReply = {
  answer: string;
  /** Routes of the learning objects the answer drew on, for the reader to link. */
  sources: string[];
};
