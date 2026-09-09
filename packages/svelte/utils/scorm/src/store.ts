/**
 * Browser-local persistence for SCORM state.
 *
 * Used on its own in anonymous mode and in static builds, and as the write-through cache
 * in front of a remote store elsewhere: a SCO commits far more often than is worth a
 * network round trip, and a learner who loses connectivity mid-attempt should still be
 * able to resume.
 */

import type { ScormStore, ScormSummary } from "./types.ts";

function storageKey(courseId: string, loId: string): string {
  return `tutors-scorm:${courseId}:${loId}`;
}

/**
 * A store backed by `localStorage`.
 *
 * Storage is unavailable in a few real situations — private browsing in older Safari,
 * an over-quota origin, a sandboxed frame — and none of them should stop the SCO from
 * running, so failures degrade to an in-memory attempt rather than throwing.
 */
export function createLocalScormStore(courseId: string, loId: string): ScormStore {
  const key = storageKey(courseId, loId);
  let fallback: Record<string, string> = {};

  return {
    load(): Record<string, string> {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return fallback;
      }
    },
    save(cmi: Record<string, string>): void {
      fallback = cmi;
      try {
        localStorage.setItem(key, JSON.stringify(cmi));
      } catch {
        // Nothing further to do: the attempt continues in memory.
      }
    },
  };
}

/**
 * Combine local storage with a remote store.
 *
 * Reads prefer the remote copy so a learner resumes on any device, falling back to the
 * local one when the remote is empty or unreachable. Writes always go to both.
 */
export function createScormStore(
  courseId: string,
  loId: string,
  remote?: { initial: Record<string, string>; save: (cmi: Record<string, string>, summary: ScormSummary) => void },
): ScormStore {
  const local = createLocalScormStore(courseId, loId);
  if (!remote) return local;
  return {
    load: () => (Object.keys(remote.initial).length > 0 ? remote.initial : local.load()),
    save: (cmi, summary) => {
      local.save(cmi, summary);
      remote.save(cmi, summary);
    },
  };
}
