/**
 * What learning insights are computed from and what they answer with. Insights read stored help
 * requests and lecturer annotations as facts: their step, who and when, never their free text (no
 * student name, no hint, no annotation body), so nothing written to one student can reach a page of
 * numbers (Rule 0410). Browser-safe: only types and constants.
 */
import type { HelpKind } from "@tutors/community/assistance";

/** A lab step: the course, the lab's route (`/lab/<courseId>/...`) and the step's id in it. */
export type StepRef = { courseId: string; labRoute: string; stepId: string };

/** One help request, as the `insights_help_requests` view carries it. */
export type HelpFact = {
  id: string;
  ref: StepRef;
  learnerId: string;
  kind: HelpKind;
  requestedAt: string;
  acknowledgedAt: string | null;
  closedAt: string | null;
  closedReason: "resolved" | "hint" | "withdrawn" | "expired" | null;
};

/** One lecturer annotation, as the `insights_annotations` view carries it. */
export type AnnotationFact = {
  id: string;
  ref: StepRef;
  /** The student it was addressed to, or null for an explanation to everyone on the step. */
  learnerId: string | null;
  createdAt: string;
  revokedAt: string | null;
};

/** A half-open period of ISO instants, `from` included and `to` not. */
export type InsightsPeriod = { from: string; to: string };

/** Median and 90th percentile seconds over `count` requests; both null when withheld or when there were none. */
export type ResponseTime = { median: number | null; p90: number | null; count: number };
export type ResponseTimes = Record<HelpKind, { acknowledge: ResponseTime; resolve: ResponseTime }>;

/** How much help a step needed over the period. */
export type StepStruggle = {
  ref: StepRef;
  requests: Record<HelpKind, number>;
  /** Every request raised at the step, whatever its kind. */
  total: number;
  acknowledged: number;
  medianWaitSeconds: number | null;
  p90WaitSeconds: number | null;
  helpedByHint: number;
  annotations: number;
};

/** Time to acknowledge and to resolve on one UTC day, `YYYY-MM-DD`. */
export type DailyResponseTimes = { day: string; times: ResponseTimes };

export type CohortProfile = { courseId: string; students: number; percentilesShown: boolean };

export type CourseInsights = {
  cohort: CohortProfile;
  /** Hardest first: most requests, then the longest median wait. */
  steps: StepStruggle[];
  /** One entry per day that had a request, oldest first. */
  responseTimes: DailyResponseTimes[];
};

/** One student's part in a course over the period (Rule 0414). */
export type StudentProgress = { learnerId: string; requestsRaised: number; hintsRead: number; annotationsReceived: number };

/** The spans an educator picks from: the chosen day, the 7 days or the 30 days ending with it. */
export const INSIGHTS_SPANS = ["day", "week", "month"] as const;
export type InsightsSpan = (typeof INSIGHTS_SPANS)[number];

/**
 * Why there is no answer: `signed-out` (nobody is signed in to the reader), `forbidden` (not an
 * educator of the course, or a course that does not admit them), `not-kept` (the server keeps no
 * help requests or feedback), `not-ready` (the insights views are missing, Rule 0416), `invalid` (a
 * malformed ask) and `unavailable` (the read failed; try again).
 */
export const INSIGHTS_REFUSALS = ["signed-out", "forbidden", "not-kept", "not-ready", "invalid", "unavailable"] as const;
export type InsightsRefusal = (typeof INSIGHTS_REFUSALS)[number];

export type InsightsAnswer<T> = { ok: true; period: InsightsPeriod; value: T } | { ok: false; reason: InsightsRefusal };
