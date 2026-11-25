/**
 * Events Tutors records as a learner moves through a course, as plain data.
 *
 * Transport details (Supabase RPCs, Realtime channels) stay in the adapters; these are the
 * payloads they carry. What a learner is looking at right now is a presence event
 * (../presence/events.ts), not a learning event.
 */
import type { LoType } from "../course/vocabulary.ts";

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
