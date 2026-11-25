import type { CourseId } from "@tutors/domain/course/address";
import type { ContentLock, LockWrite } from "@tutors/domain/access";

/**
 * The content locks lecturers set on a course. Who is changing a lock is not an argument: the
 * adapter behind this port knows the caller from the session, so a caller cannot name someone else.
 */
export interface AccessStore {
  locks(courseId: CourseId): Promise<ContentLock[]>;
  /** Lock or unlock a route, and say what became of the change. */
  setLock(courseId: CourseId, loRoute: string, locked: boolean): Promise<LockWrite>;
}
