import type { LearningEvent } from "@tutors/domain/learning";
import type { PresenceEvent } from "@tutors/domain/presence";
import type { Unsubscribe } from "./presence.ts";

/** Something that happened in the application, for any part of it to react to. */
export type AppEvent =
  | { type: "learning"; learnerId: string; event: LearningEvent }
  | { type: "presence"; event: PresenceEvent };

/** Delivers application events to whoever subscribed; in-process today, a broker later. */
export interface EventPublisher {
  publish(event: AppEvent): Promise<void>;
  subscribe(listener: (event: AppEvent) => void): Unsubscribe;
}
