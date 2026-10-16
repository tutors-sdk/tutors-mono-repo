/**
 * Learning insights as the reader runs them: rows of assistance_requests and feedback_annotations
 * kept in the recording Supabase as the help request and feedback servers write them (free text
 * included, so a scenario can prove the views leave it out), and the insights API over the recorder,
 * with each course's published access rules held here instead of fetched.
 */
import type { CourseAccess } from "../../../packages/svelte/utils/feedback/src/server/index.ts";
import { insightsApi, supabaseInsightsRead } from "../../../packages/svelte/utils/insights/src/server/index.ts";
import { recorder } from "./supabase-recorder.ts";

type Row = Record<string, unknown>;

let ids = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;

/** `YYYY-MM-DD` and `HH:MM:SS` as an ISO instant, or null for an empty cell. */
export const at = (day: string, time: string | undefined): string | null => (time ? new Date(`${day}T${time}.000Z`).toISOString() : null);
export const plus = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();

export type SeedRequest = {
  courseId: string;
  labRoute: string;
  stepId: string;
  learner: string;
  kind: "stuck" | "hint" | "lecturer";
  requestedAt: string;
  acknowledgedAt?: string | null;
  closedAt?: string | null;
  reason?: "resolved" | "hint" | "withdrawn" | "expired" | null;
};

/** A help request as POST /api/assistance keeps it: the learner's name and the hint's text included. */
export function seedRequest(r: SeedRequest): Row {
  const closed = r.closedAt ?? null;
  const row: Row = {
    id: nextId(),
    course_id: r.courseId,
    lab_route: r.labRoute,
    step_id: r.stepId,
    learner_id: r.learner,
    learner_name: `${r.learner.toUpperCase()} NAME`,
    kind: r.kind,
    state: closed ? (r.reason === "withdrawn" || r.reason === "expired" ? "withdrawn" : "resolved") : r.acknowledgedAt ? "acknowledged" : "open",
    requested_at: r.requestedAt,
    acknowledged_by: r.acknowledgedAt ? "ellen" : null,
    acknowledged_at: r.acknowledgedAt ?? null,
    closed_by: closed ? "ellen" : null,
    closed_at: closed,
    closed_reason: closed ? (r.reason ?? "resolved") : null,
    hint_text: r.reason === "hint" ? `A HINT FOR ${r.learner.toUpperCase()}` : null
  };
  recorder.seed("assistance_requests", [row]);
  return row;
}

/** An annotation as POST /api/feedback keeps it: its body included. */
export function seedAnnotation(a: { courseId: string; labRoute: string; stepId: string; learner: string | null; createdAt: string; revokedAt?: string | null }): Row {
  const row: Row = {
    id: nextId(),
    course_id: a.courseId,
    lab_route: a.labRoute,
    step_id: a.stepId,
    audience: a.learner ? "student" : "everyone",
    learner_id: a.learner,
    body: `AN ANNOTATION BODY ${ids}`,
    author_id: "ellen",
    created_at: a.createdAt,
    revoked_at: a.revokedAt ?? null
  };
  recorder.seed("feedback_annotations", [row]);
  return row;
}

/** The free text the help request and feedback servers keep, which no insights answer may carry. */
export const FREE_TEXT = /NAME|A HINT FOR|AN ANNOTATION BODY/;

export function insightsWorld() {
  const courses = new Map<string, CourseAccess>();
  const api = () => insightsApi({ read: supabaseInsightsRead(recorder as never), accessOf: async (courseId) => courses.get(courseId) ?? null });

  return {
    api,
    teach(courseId: string, educators: string[]) {
      courses.set(courseId, { authLevel: 0, enrollment: { educators } });
    },
    /** Answers Tutors Time's GET /api/insights as `login`. */
    async serve(login: string | null, url: string): Promise<Response> {
      const answer = await api().get(new URL(url).searchParams, login ? { login } : null);
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
    }
  };
}
