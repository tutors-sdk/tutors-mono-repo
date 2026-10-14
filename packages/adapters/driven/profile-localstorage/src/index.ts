/**
 * A learner's record in the browser's localStorage: the ProfilePort for a visitor who is not
 * signed in, and the anonymous reader. Keys are the ones the reader has always used
 * (`courseVisits`, `sentiment`, `share`), so nothing a learner stored is lost.
 */
import { parseSentiment, parseSharing, type CourseVisit } from "@tutors/domain/presence";
import type { ProfilePort } from "@tutors/application/ports";

/** The subset of Storage this adapter uses, so tests can pass a plain object. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** `storage` defaults to the browser's localStorage; on the server there is none and every read is empty. */
export function localStorageProfile(storage: () => KeyValueStorage | null = browserStorage): ProfilePort {
  return {
    async getCourseVisits() {
      const stored = storage()?.getItem("courseVisits");
      if (!stored) return [];
      try {
        return JSON.parse(stored) as CourseVisit[];
      } catch {
        return [];
      }
    },
    async saveCourseVisits(_learnerId, visits) {
      storage()?.setItem("courseVisits", JSON.stringify(visits));
    },
    async upsertLearner(profile) {
      if (profile.sharing !== null) storage()?.setItem("share", String(profile.sharing));
      if (profile.sentiment) storage()?.setItem("sentiment", profile.sentiment);
    },
    async getSentiment() {
      return parseSentiment(storage()?.getItem("sentiment"));
    },
    async setSentiment(_learnerId, sentiment) {
      storage()?.setItem("sentiment", sentiment);
    },
    async getSharing() {
      return parseSharing(storage()?.getItem("share"));
    },
    async setSharing(_learnerId, sharing) {
      storage()?.setItem("share", String(sharing));
    }
  };
}
