/**
 * What a learner who shares their presence is looking at, as plain data: broadcast to live views
 * and stored as the latest snapshot per learner per course. The reactive `LoRecord` class in the
 * Svelte state adapter and the Realtime channels that carry it stay outside the domain.
 */
import type { CourseIcon, LoType } from "../course/vocabulary.ts";
import type { LearnerDisplay } from "./learner.ts";

export type PresenceEvent = {
  courseId: string;
  courseUrl: string;
  courseTitle: string;
  loRoute: string;
  title: string;
  img?: string;
  icon?: CourseIcon;
  isPrivate: boolean;
  user?: LearnerDisplay;
  type: LoType;
};
