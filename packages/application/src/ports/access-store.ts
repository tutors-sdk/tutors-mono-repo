import type { ContentLock } from "@tutors/domain/access";

/** Keeps the content locks lecturers set on a course. */
export interface AccessStore {
  locks(courseId: string): Promise<ContentLock[]>;
  /** Lock or unlock a route; resolves false when nothing was written. */
  setLock(courseId: string, loRoute: string, locked: boolean, lockedBy: string): Promise<boolean>;
  removeLock(courseId: string, loRoute: string): Promise<boolean>;
}
