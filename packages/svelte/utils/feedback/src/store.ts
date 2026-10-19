/** Where lecturers' annotations are kept: Supabase on the reader's server, or memory in tests. */
import type { Annotation, NewAnnotation, StepRef } from "./annotation.ts";
import { isFor, isRevoked, newestFirst, oldestFirst, sameStep } from "./annotation.ts";

/** The most annotations `received` answers with: the newest, as a student's history in one course. */
export const RECEIVED_LIMIT = 500;

export interface FeedbackStore {
  /** Keeps an annotation and resolves it with its id; rejects when it could not be kept. */
  annotate(annotation: NewAnnotation): Promise<Annotation>;
  /** One annotation by id, revoked or not, or null. */
  get(id: string): Promise<Annotation | null>;
  /** Every annotation at the step, revoked ones included, oldest first. */
  forStep(ref: StepRef): Promise<Annotation[]>;
  /** The unrevoked annotations of a course for a learner (addressed to them, or to everyone), newest first, at most RECEIVED_LIMIT. */
  received(courseId: string, learnerId: string): Promise<Annotation[]>;
  /**
   * Marks an annotation revoked at `at`, keeping it; resolves it as it now is, or null when there
   * is no such annotation. One already revoked keeps its first revocation time.
   */
  revoke(id: string, at: string): Promise<Annotation | null>;
}

/** A FeedbackStore in memory, for tests and a reader run without a database. */
export function memoryFeedbackStore(): FeedbackStore & { all(): Annotation[] } {
  const rows: Annotation[] = [];
  let next = 0;
  const copy = (a: Annotation): Annotation => structuredClone(a);
  return {
    all: () => rows.map(copy),
    async annotate(annotation) {
      const kept: Annotation = { ...structuredClone(annotation), id: `annotation-${++next}`, revokedAt: null };
      rows.push(kept);
      return copy(kept);
    },
    async get(id) {
      const found = rows.find((a) => a.id === id);
      return found ? copy(found) : null;
    },
    async forStep(ref) {
      return rows
        .filter((a) => sameStep(a.ref, ref))
        .sort(oldestFirst)
        .map(copy);
    },
    async received(courseId, learnerId) {
      const mine = rows.filter((a) => a.ref.courseId === courseId && !isRevoked(a) && isFor(a, learnerId));
      return newestFirst(mine).slice(0, RECEIVED_LIMIT).map(copy);
    },
    async revoke(id, at) {
      const found = rows.find((a) => a.id === id);
      if (!found) return null;
      found.revokedAt ??= at;
      return copy(found);
    }
  };
}
