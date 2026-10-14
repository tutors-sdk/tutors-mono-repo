import type { Course } from "@tutors/domain/course";
import type { LearningEvent } from "@tutors/domain/learning";
import type { PresenceEvent } from "@tutors/domain/presence";
import type { Unsubscribe } from "./presence.ts";

/** Something that happened in the application, for any part of it to react to. */
export type AppEvent =
  | { type: "learning"; learnerId: string; event: LearningEvent }
  | { type: "presence"; event: PresenceEvent }
  /** A learner opened a course; the catalogue counts it. `learnerId` is "" for a visitor who is not signed in. */
  | { type: "course-visit"; learnerId: string; course: Course };

/** Delivers application events to whoever subscribed; in-process today, a broker later. */
export interface EventPublisher {
  publish(event: AppEvent): Promise<void>;
  subscribe(listener: (event: AppEvent) => void): Unsubscribe;
}
