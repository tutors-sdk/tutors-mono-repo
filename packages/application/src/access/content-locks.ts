import type { CourseId } from "@tutors/domain/course/address";
import { lockChangeResult, lockMapOf, type LockChangeResult } from "@tutors/domain/access";
import type { AccessStore } from "../ports/access-store.ts";

export type ContentLocksDeps = { store: AccessStore };

/** The locks on a course, as a route-to-locked map. */
export const loadContentLocks = ({ store }: ContentLocksDeps) =>
  async (courseId: CourseId): Promise<Map<string, boolean>> => lockMapOf(await store.locks(courseId));

/** A lecturer locked or unlocked a route: save it, and say what the change came to for them. */
export const setContentLock = ({ store }: ContentLocksDeps) =>
  async (courseId: CourseId, loRoute: string, locked: boolean): Promise<LockChangeResult> =>
    lockChangeResult(await store.setLock(courseId, loRoute, locked));
