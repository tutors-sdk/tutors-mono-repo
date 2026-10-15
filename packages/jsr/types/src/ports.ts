/**
 * Service ports: what the apps need from presence, profile and learning-event services, with no
 * framework or database types in them. Today's interfaces (community's `PresenceService`,
 * connect's `ProfileStore`) carry Supabase `RealtimeChannel`s and Svelte state; adapters will
 * implement these instead (step 4 of guides/SHARED-TYPES.md).
 *
 * An identity port belongs with issue #416's proposal and is not defined here.
 */
import type { CourseVisit } from "./learner.ts";
import type { LearningEvent, PresenceEvent } from "./events.ts";

/** Stops a subscription. */
export type Unsubscribe = () => void;

/** Records time and page loads for the signed-in learner. */
export interface LearningEventSink {
  record(event: LearningEvent): Promise<void>;
}

/** Shares and watches presence. */
export interface PresencePort {
  /** Broadcast what a sharing learner is looking at. */
  publish(event: PresenceEvent): Promise<void>;
  /** Watch one course's learners, or every course when `courseId` is omitted. */
  subscribe(listener: (event: PresenceEvent) => void, courseId?: string): Unsubscribe;
}

/** Reads and changes a learner's course-visit history. */
export interface ProfilePort {
  getCourseVisits(): Promise<CourseVisit[]>;
  logCourseVisit(visit: CourseVisit): Promise<void>;
  setFavourite(courseId: string, favourite: boolean): Promise<void>;
  deleteCourseVisit(courseId: string): Promise<void>;
}
