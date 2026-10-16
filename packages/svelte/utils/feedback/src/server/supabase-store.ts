/**
 * The FeedbackStore over Supabase's `feedback_annotations`
 * (supabase/migrations/20261018_feedback_annotations.sql). The table is closed to the anon key every
 * browser holds, so only the reader's server reads and writes it, with the service-role client.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { newestFirst, type Annotation, type StepRef } from "../annotation.ts";
import { RECEIVED_LIMIT, type FeedbackStore } from "../store.ts";

export const ANNOTATIONS_TABLE = "feedback_annotations";

type Row = {
  id: string;
  course_id: string;
  lab_route: string;
  step_id: string;
  audience: "student" | "everyone";
  learner_id: string | null;
  body: string;
  author_id: string;
  created_at: string;
  revoked_at: string | null;
};

const COLUMNS = "id, course_id, lab_route, step_id, audience, learner_id, body, author_id, created_at, revoked_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres answers timestamps in its own format; the rest of tutors compares ISO strings. */
const iso = (at: string | null): string | null => (at === null ? null : new Date(at).toISOString());

export function annotationFromRow(row: Row): Annotation {
  return {
    id: row.id,
    ref: { courseId: row.course_id, labRoute: row.lab_route, stepId: row.step_id },
    audience: row.audience === "everyone" || !row.learner_id ? { kind: "everyone" } : { kind: "student", learnerId: row.learner_id },
    body: row.body,
    authorId: row.author_id,
    createdAt: iso(row.created_at)!,
    revokedAt: iso(row.revoked_at)
  };
}

/** Rejects with the database's message, so the caller's catch can answer 503. */
function rows<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * The server's own client, with the service-role key: it bypasses RLS, so it is made only on the
 * reader's server and never kept a session. Null when either setting is missing.
 */
export function serviceClient(url: string | undefined, serviceRoleKey: string | undefined): SupabaseClient | null {
  if (!url?.trim() || !serviceRoleKey?.trim()) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function supabaseFeedbackStore(client: SupabaseClient): FeedbackStore {
  const table = () => client.from(ANNOTATIONS_TABLE);
  const get = async (id: string): Promise<Annotation | null> => {
    if (!UUID.test(id)) return null;
    const found = rows<Row[]>(await table().select(COLUMNS).eq("id", id).limit(1));
    return found.length ? annotationFromRow(found[0]) : null;
  };
  return {
    async annotate(annotation) {
      const row = {
        course_id: annotation.ref.courseId,
        lab_route: annotation.ref.labRoute,
        step_id: annotation.ref.stepId,
        audience: annotation.audience.kind,
        learner_id: annotation.audience.kind === "student" ? annotation.audience.learnerId : null,
        body: annotation.body,
        author_id: annotation.authorId,
        created_at: annotation.createdAt
      };
      return annotationFromRow(rows<Row>(await table().insert(row).select(COLUMNS).single()));
    },
    get,
    async forStep(ref: StepRef) {
      const found = rows<Row[]>(
        await table()
          .select(COLUMNS)
          .eq("course_id", ref.courseId)
          .eq("lab_route", ref.labRoute)
          .eq("step_id", ref.stepId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      );
      return found.map(annotationFromRow);
    },
    async received(courseId, learnerId) {
      // Two reads rather than one `or` filter, so a login is never spliced into a filter string.
      const [mine, everyone] = await Promise.all([
        table().select(COLUMNS).eq("course_id", courseId).eq("learner_id", learnerId).is("revoked_at", null).order("created_at", { ascending: false }).limit(RECEIVED_LIMIT),
        table().select(COLUMNS).eq("course_id", courseId).eq("audience", "everyone").is("revoked_at", null).order("created_at", { ascending: false }).limit(RECEIVED_LIMIT)
      ]);
      return newestFirst([...rows<Row[]>(mine), ...rows<Row[]>(everyone)].map(annotationFromRow)).slice(0, RECEIVED_LIMIT);
    },
    async revoke(id, at) {
      if (!UUID.test(id)) return null;
      // Only an unrevoked row changes, so a second revoke keeps the first time.
      rows(await table().update({ revoked_at: at }).eq("id", id).is("revoked_at", null));
      return get(id);
    }
  };
}
