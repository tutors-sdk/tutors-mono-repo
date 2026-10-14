import type { PresenceEvent, StoredPresence } from "@tutors/domain/presence";

/** Stops a subscription. */
export type Unsubscribe = () => void;

/** Shares and watches presence. */
export interface PresencePort {
  /** Broadcast what a sharing learner is looking at, and keep it as their latest snapshot. */
  publish(event: PresenceEvent): Promise<void>;
  /** Watch one course's learners live, or every course when `courseId` is omitted. */
  subscribe(listener: (event: PresenceEvent) => void, courseId?: string): Unsubscribe;
  /**
   * The latest snapshot of each learner active in a course since `sinceIso`, newest first; null
   * when the read fails, so a caller can tell a failure from a course nobody is in.
   */
  recent(courseId: string, sinceIso: string): Promise<StoredPresence[] | null>;
}
