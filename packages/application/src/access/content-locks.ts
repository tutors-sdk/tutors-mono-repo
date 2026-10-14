import { lockMapOf } from "@tutors/domain/access";
import type { AccessStore } from "../ports/access-store.ts";

export type ContentLocksDeps = { store: AccessStore };

/** The locks on a course, as a route-to-locked map. */
export const loadContentLocks = ({ store }: ContentLocksDeps) =>
  async (courseId: string): Promise<Map<string, boolean>> => lockMapOf(await store.locks(courseId));

/** A lecturer locked or unlocked a route. */
export const setContentLock = ({ store }: ContentLocksDeps) =>
  (courseId: string, loRoute: string, locked: boolean, lockedBy: string): Promise<boolean> =>
    store.setLock(courseId, loRoute, locked, lockedBy);
