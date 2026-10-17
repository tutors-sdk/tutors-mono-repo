/**
 * The reader server's side of learning insights (GET /api/insights): what an educator of a course
 * reads of its help requests and annotations over a day, a week or a month, answered as a status
 * and a JSON body. Anyone else is refused before a row is read, a private course admits only its
 * whitelist and educators (Rule 0567), and nothing is written (Rule 0410).
 */
import { admits, teaches, type CourseAccess } from "@tutors/feedback/server";
import { INSIGHTS_SPANS, type InsightsPeriod, type InsightsRefusal, type InsightsSpan } from "../facts.ts";
import { courseInsights, studentProgress } from "./compute.ts";
import { InsightsNotReadyError, type InsightsRead } from "./read.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const SPAN_DAYS: Record<InsightsSpan, number> = { day: 1, week: 7, month: 30 };

/**
 * The span ending with the UTC day `YYYY-MM-DD`, that day included: the day alone, the 7 days or
 * the 30 days up to it. Null for anything but a real calendar day, so a read is always bounded
 * (Rule 0417).
 */
export function insightsPeriod(span: InsightsSpan, day: string): InsightsPeriod | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Object.hasOwn(SPAN_DAYS, span)) return null;
  const end = Date.parse(`${day}T00:00:00.000Z`) + DAY_MS;
  if (Number.isNaN(end) || new Date(end - DAY_MS).toISOString().slice(0, 10) !== day) return null;
  return { from: new Date(end - SPAN_DAYS[span] * DAY_MS).toISOString(), to: new Date(end).toISOString() };
}

/** What Tutors Time asks: a course's insights, or one student's when `learnerId` is given. */
export type InsightsAsk = { courseId: string; span: InsightsSpan; day: string; learnerId: string | null };

const isSpan = (value: unknown): value is InsightsSpan => typeof value === "string" && (INSIGHTS_SPANS as readonly string[]).includes(value);

/** The ask in a query string, or why it is malformed. */
export function parseInsightsAsk(query: URLSearchParams): InsightsAsk | string {
  const courseId = query.get("courseId")?.trim() ?? "";
  if (!courseId || courseId.length > 200) return "courseId is required";
  const span = query.get("span") ?? "day";
  if (!isSpan(span)) return `span is one of ${INSIGHTS_SPANS.join(", ")}`;
  const day = query.get("day")?.trim() ?? "";
  if (!insightsPeriod(span, day)) return "day is a calendar day, YYYY-MM-DD";
  const learnerId = query.get("learnerId")?.trim() || null;
  if (learnerId && learnerId.length > 100) return "learnerId is at most 100 characters";
  return { courseId, span, day, learnerId };
}

export type InsightsApiDeps = {
  /** Null when this server keeps no help requests or feedback (anonymous mode, or no service key). */
  read: InsightsRead | null;
  /** The course's access rules, or null when the course cannot be read. */
  accessOf: (courseId: string) => Promise<CourseAccess | null>;
};

export type Answer = { status: number; body: Record<string, unknown> };

/** The status and message each refusal answers with. */
export const INSIGHTS_ANSWERS: Record<InsightsRefusal, { status: number; message: string }> = {
  "signed-out": { status: 401, message: "Sign in with GitHub to read insights" },
  invalid: { status: 400, message: "That is not a course and a day tutors can read insights for" },
  "not-kept": { status: 503, message: "Insights are not kept on this server" },
  forbidden: { status: 403, message: "Only an educator of the course may read its insights" },
  "not-ready": { status: 503, message: "Insights are not set up on this server yet" },
  unavailable: { status: 503, message: "The insights could not be read; try again" }
};

const refuse = (reason: InsightsRefusal, detail?: string): Answer => ({ status: INSIGHTS_ANSWERS[reason].status, body: { message: detail ?? INSIGHTS_ANSWERS[reason].message, reason } });

export function insightsApi({ read, accessOf }: InsightsApiDeps) {
  return {
    /** GET /api/insights?courseId=&span=&day=[&learnerId=] as `login`, or nobody. */
    async get(query: URLSearchParams, actor: { login: string } | null): Promise<Answer> {
      if (!actor) return refuse("signed-out");
      const ask = parseInsightsAsk(query);
      if (typeof ask === "string") return refuse("invalid", ask);
      if (!read) return refuse("not-kept");
      const access = await accessOf(ask.courseId);
      if (!access) return refuse("unavailable", "The course could not be read; try again");
      if (!admits(access, actor.login) || !teaches(access, actor.login)) return refuse("forbidden");
      const period = insightsPeriod(ask.span, ask.day)!;
      try {
        const [requests, annotations] = await Promise.all([read.helpRequests(ask.courseId, period), read.annotations(ask.courseId, period)]);
        if (ask.learnerId) return { status: 200, body: { period, progress: studentProgress(ask.learnerId, requests, annotations) } };
        return { status: 200, body: { period, insights: courseInsights(ask.courseId, requests, annotations) } };
      } catch (error) {
        return refuse(error instanceof InsightsNotReadyError ? "not-ready" : "unavailable");
      }
    }
  };
}
