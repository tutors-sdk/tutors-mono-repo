/**
 * The one read insights compute from (Rule 0410): a course's stored help requests and annotations
 * over a bounded period, through the views of supabase/migrations/20261022_insights_views.sql. It
 * has no write method. The views carry no free text and are closed to the anon key, so only the
 * reader's server reads them, with the service-role client. Every read names the course and the
 * period, over an index that leads with both (Rule 0417).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnotationFact, HelpFact, InsightsPeriod } from "../facts.ts";

export interface InsightsRead {
  /** The course's help requests raised in the period, in no particular order. */
  helpRequests(courseId: string, period: InsightsPeriod): Promise<HelpFact[]>;
  /** The course's annotations created in the period, revoked ones included. */
  annotations(courseId: string, period: InsightsPeriod): Promise<AnnotationFact[]>;
}

/**
 * What an InsightsRead rejects with when the database has no insights views yet (a deployment whose
 * migration has not run): Tutors Time then shows its insights pages empty with one message and
 * keeps everything else working (Rule 0416).
 */
export class InsightsNotReadyError extends Error {
  constructor(message = "The insights views are not in the database yet") {
    super(message);
    this.name = "InsightsNotReadyError";
  }
}

export const HELP_VIEW = "insights_help_requests";
export const ANNOTATIONS_VIEW = "insights_annotations";
export const HELP_COLUMNS = "id, course_id, lab_route, step_id, learner_id, kind, requested_at, acknowledged_at, closed_at, closed_reason";
export const ANNOTATION_COLUMNS = "id, course_id, lab_route, step_id, learner_id, created_at, revoked_at";

type Row = Record<string, unknown>;
type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** PostgREST's answer for a relation it does not know, and Postgres's own. */
const MISSING_RELATION = new Set(["PGRST205", "42P01"]);

/** Postgres answers timestamps in its own format; the rest of tutors compares ISO strings. */
const iso = (value: unknown): string | null => (typeof value === "string" && value ? new Date(value).toISOString() : null);

const refOf = (r: Row) => ({ courseId: String(r.course_id), labRoute: String(r.lab_route), stepId: String(r.step_id) });

export function helpFactFromRow(r: Row): HelpFact {
  return {
    id: String(r.id),
    ref: refOf(r),
    learnerId: String(r.learner_id),
    kind: r.kind as HelpFact["kind"],
    requestedAt: iso(r.requested_at)!,
    acknowledgedAt: iso(r.acknowledged_at),
    closedAt: iso(r.closed_at),
    closedReason: (r.closed_reason as HelpFact["closedReason"]) ?? null
  };
}

export function annotationFactFromRow(r: Row): AnnotationFact {
  return { id: String(r.id), ref: refOf(r), learnerId: (r.learner_id as string | null) ?? null, createdAt: iso(r.created_at)!, revokedAt: iso(r.revoked_at) };
}

async function rows(query: PromiseLike<Answer>): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw MISSING_RELATION.has(error.code ?? "") ? new InsightsNotReadyError(error.message) : new Error(error.message);
  return (data as Row[] | null) ?? [];
}

/** Supabase answers at most this many rows a query (its default max rows), so a period is read in pages of it. */
export const PAGE_ROWS = 1000;

export function supabaseInsightsRead(client: SupabaseClient): InsightsRead {
  async function within(view: string, columns: string, time: string, courseId: string, period: InsightsPeriod): Promise<Row[]> {
    const found: Row[] = [];
    for (let from = 0; ; from += PAGE_ROWS) {
      const page = await rows(
        client
          .from(view)
          .select(columns)
          .eq("course_id", courseId)
          .gte(time, period.from)
          .lt(time, period.to)
          .order(time, { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE_ROWS - 1) as unknown as PromiseLike<Answer>
      );
      found.push(...page);
      if (page.length < PAGE_ROWS) return found;
    }
  }
  return {
    helpRequests: async (courseId, period) => (await within(HELP_VIEW, HELP_COLUMNS, "requested_at", courseId, period)).map(helpFactFromRow),
    annotations: async (courseId, period) => (await within(ANNOTATIONS_VIEW, ANNOTATION_COLUMNS, "created_at", courseId, period)).map(annotationFactFromRow)
  };
}
