/**
 * What Tutors Time asks of learning insights, over the reader's GET /api/insights with the reader's
 * session. Time computes nothing and reads no table: the reader's server answers an educator of the
 * course with numbers only (Rules 0410, 0412 to 0414).
 */
import { INSIGHTS_REFUSALS, type CourseInsights, type InsightsAnswer, type InsightsRefusal, type InsightsSpan, type StudentProgress } from "./facts.ts";

export interface InsightsDesk {
  /** The course's ranked steps, response times and cohort over the span ending with `day` (`YYYY-MM-DD`). */
  course(courseId: string, span: InsightsSpan, day: string): Promise<InsightsAnswer<CourseInsights>>;
  /** One student's part in the course over the span ending with `day`. */
  student(courseId: string, learnerId: string, span: InsightsSpan, day: string): Promise<InsightsAnswer<StudentProgress>>;
}

const reasonOf = (value: unknown): InsightsRefusal => INSIGHTS_REFUSALS.find((r) => r === value) ?? "unavailable";

/**
 * The desk over the reader at `readerOrigin` (Tutors Time's PUBLIC_READER_ORIGIN). The call carries
 * the reader's session cookie, which the reader's server reads to know who is asking; it answers
 * only Tutors Time's own origin (PUBLIC_TIME_ORIGIN).
 */
export function readerInsightsDesk(readerOrigin: string, fetchFn: typeof fetch = (...args) => fetch(...args)): InsightsDesk {
  let end = readerOrigin.length;
  while (end > 0 && readerOrigin[end - 1] === "/") end--;
  const base = `${readerOrigin.slice(0, end)}/api/insights`;
  async function ask<T>(query: Record<string, string>, key: "insights" | "progress"): Promise<InsightsAnswer<T>> {
    try {
      const response = await fetchFn(`${base}?${new URLSearchParams(query)}`, { credentials: "include", headers: { accept: "application/json" } });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.ok && body[key] && body.period) return { ok: true, period: body.period as { from: string; to: string }, value: body[key] as T };
      return { ok: false, reason: response.status === 401 ? "signed-out" : reasonOf(body.reason) };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
  return {
    course: (courseId, span, day) => ask<CourseInsights>({ courseId, span, day }, "insights"),
    student: (courseId, learnerId, span, day) => ask<StudentProgress>({ courseId, learnerId, span, day }, "progress")
  };
}
