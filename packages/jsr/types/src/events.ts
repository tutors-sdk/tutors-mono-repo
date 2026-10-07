/**
 * Events Tutors records or broadcasts as a learner moves through a course, as plain data.
 *
 * Reactive classes (community's `$state` `LoRecord`) and transport details (Supabase Realtime
 * channels) stay in the packages that own them; these are the payloads they carry.
 */
import type { CourseIcon, LoType } from "./learning-objects.ts";
import type { LearnerDisplay } from "./learner.ts";

/** A calendar day as `YYYY-MM-DD`, the `id` column of the `calendar` table. */
export type CalendarDay = string;

/**
 * Time and page-load tracking for the signed-in learner. Matches the `AnalyticsEvent` body of
 * `POST /api/analytics` in PR #327's data API, with the learning-object kind narrowed to `LoType`.
 */
export type LearningEvent = PageLoadEvent | TickEvent;

/** A learning object was opened. */
export type PageLoadEvent = { kind: "page-load"; courseId: string; loId: string; loType: LoType; day: CalendarDay };

/** The 30-second "still reading" tick while a page is visible. */
export type TickEvent = { kind: "tick"; courseId: string; loId: string | null; day: CalendarDay };

export type LearningEventKind = LearningEvent["kind"];

/**
 * What a learner who shares their presence is looking at, as broadcast to live views and stored
 * in `tutors-connect-latest.payload`. The plain-data form of community's `LoRecord`.
 */
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
