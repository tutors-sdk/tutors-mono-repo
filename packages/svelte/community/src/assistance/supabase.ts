/**
 * Help requests on Supabase, for the reader's server only. `supabaseAssistanceStore` keeps them in
 * `assistance_requests` (supabase/migrations/20261020_assistance_requests.sql), whose Row-Level
 * Security admits no anon call, so the client handed in carries the service role key: only
 * POST /api/assistance writes, after it has checked who is asking (Rule 0390). A second live
 * request of a learner in a course is refused by the table's partial unique index, and `replace` is
 * a compare-and-set on the state, kind, step and rating it was read with. The use cases answer a failed
 * query as "try again", so each one is logged here.
 *
 * `supabaseAssistanceFeed` tells Tutors Live a course's queue changed on the topic
 * topics.helpQueue(courseId). A Realtime topic is open to anyone who holds the public key, so the
 * notice names the request's id and state and nothing else; the queue itself is read from
 * GET /api/assistance by an educator of the course (Rule 0392). It publishes only while a Live tab
 * watches the topic, charged to Live's daily budget.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { topics } from "@tutors/realtime";
import { supabaseRealtimeAdapter } from "@tutors/realtime-supabase";
import log, { withRequestId } from "@tutors/logger";
import type { HelpClosure, HelpRequest, NewHelpRequest } from "./help-request.ts";
import type { AssistanceFeed, AssistanceStore } from "./ports.ts";

const TABLE = "assistance_requests";
const COLUMNS =
  "id, course_id, lab_route, step_id, learner_id, learner_name, kind, state, requested_at, acknowledged_by, acknowledged_at, closed_by, closed_at, closed_reason, hint_text, helped";

/** A UUID; any other id names no row, so it is answered without asking the database. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;
type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** Postgres gives timestamptz back in its own format; the domain compares ISO instants. */
const iso = (value: unknown): string | null => (typeof value === "string" && value ? new Date(value).toISOString() : null);

function fromRow(r: Row): HelpRequest {
  const acknowledgedAt = iso(r.acknowledged_at);
  const closedAt = iso(r.closed_at);
  return {
    id: String(r.id),
    ref: { courseId: r.course_id as string, labRoute: r.lab_route as string, stepId: r.step_id as string },
    learnerId: r.learner_id as string,
    learnerName: (r.learner_name as string | null) ?? null,
    kind: r.kind as HelpRequest["kind"],
    state: r.state as HelpRequest["state"],
    requestedAt: iso(r.requested_at) as string,
    acknowledged: r.acknowledged_by && acknowledgedAt ? { by: r.acknowledged_by as string, at: acknowledgedAt } : null,
    closed: r.closed_by && closedAt && r.closed_reason ? { by: r.closed_by as string, at: closedAt, reason: r.closed_reason as HelpClosure["reason"] } : null,
    hintText: (r.hint_text as string | null) ?? null,
    helped: typeof r.helped === "boolean" ? r.helped : null
  };
}

function toRow(request: NewHelpRequest): Row {
  return {
    course_id: request.ref.courseId,
    lab_route: request.ref.labRoute,
    step_id: request.ref.stepId,
    learner_id: request.learnerId,
    learner_name: request.learnerName,
    kind: request.kind,
    state: request.state,
    requested_at: request.requestedAt,
    acknowledged_by: request.acknowledged?.by ?? null,
    acknowledged_at: request.acknowledged?.at ?? null,
    closed_by: request.closed?.by ?? null,
    closed_at: request.closed?.at ?? null,
    closed_reason: request.closed?.reason ?? null,
    hint_text: request.hintText,
    helped: request.helped ?? null
  };
}

/** The query's rows; logs and throws when Supabase answered with an error. */
async function run(what: string, query: PromiseLike<Answer>): Promise<unknown> {
  const { data, error } = await query;
  if (error) {
    log.error("A help request query failed:", what, error);
    throw new Error(`${what}: ${error.message}`);
  }
  return data;
}

export type AssistanceClient = SupabaseClient;

/**
 * The reader server's client for help requests, with the service role key. It never keeps a session;
 * calls made while serving a request carry its x-request-id.
 */
export function assistanceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: withRequestId() } });
}

export function supabaseAssistanceStore(client: SupabaseClient): AssistanceStore {
  return {
    async open(request) {
      if (!request.ref?.courseId || !request.learnerId) throw new Error("a help request needs a step and a learner");
      return fromRow((await run(`${TABLE} insert`, client.from(TABLE).insert(toRow(request)).select(COLUMNS).single())) as Row);
    },

    async get(id) {
      if (!UUID.test(id)) return null;
      const row = (await run(`${TABLE} select`, client.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle())) as Row | null;
      return row ? fromRow(row) : null;
    },

    async live(courseId) {
      if (!courseId) return [];
      const rows = (await run(`${TABLE} live`, client.from(TABLE).select(COLUMNS).eq("course_id", courseId).in("state", ["open", "acknowledged"]))) as Row[];
      return (rows ?? []).map(fromRow);
    },

    async latest(courseId, learnerId) {
      if (!courseId || !learnerId) return null;
      const row = (await run(
        `${TABLE} latest`,
        client.from(TABLE).select(COLUMNS).eq("course_id", courseId).eq("learner_id", learnerId).order("requested_at", { ascending: false }).limit(1).maybeSingle()
      )) as Row | null;
      return row ? fromRow(row) : null;
    },

    async replace(next, prior) {
      if (!UUID.test(next.id)) return false;
      const update = client
        .from(TABLE)
        .update(toRow(next))
        .eq("id", next.id)
        .eq("state", prior.state)
        .eq("kind", prior.kind)
        .eq("lab_route", prior.ref.labRoute)
        .eq("step_id", prior.ref.stepId);
      // A rating is answered once: the row must still carry the rating it was read with.
      const rated = prior.helped === null || prior.helped === undefined ? update.is("helped", null) : update.eq("helped", prior.helped);
      const rows = (await run(`${TABLE} update`, rated.select("id"))) as Row[] | null;
      return rows?.length === 1;
    }
  };
}

/** The notice Tutors Live hears on a course's help queue topic: which request changed, and to what. */
export type HelpQueueNotice = { courseId: string; id: string; state: HelpRequest["state"] };

export function supabaseAssistanceFeed(client: SupabaseClient): AssistanceFeed {
  const adapter = supabaseRealtimeAdapter(client);
  return {
    async publish(request) {
      const courseId = request.ref.courseId;
      const { data, error } = await client.rpc("realtime_claim_assistance_publish", { p_course_id: courseId });
      if (error) {
        log.warn("realtime_claim_assistance_publish failed:", error);
        return false;
      }
      if ((data as { publish?: unknown } | null)?.publish !== true) return false;
      const notice: HelpQueueNotice = { courseId, id: request.id, state: request.state };
      try {
        await adapter.publish(topics.helpQueue(courseId), "help-request", notice);
        return true;
      } catch (error) {
        log.error("Publishing a help queue notice failed:", courseId, error);
        return false;
      }
    }
  };
}
