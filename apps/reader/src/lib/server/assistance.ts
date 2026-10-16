/**
 * The reader server's side of help requests: the use cases over the Supabase store and feed, the
 * course's educators from its published enrollment, and the parsing of what a browser posts to
 * /api/assistance. Every write runs here, as the session's actor (Rule 0390); a browser only asks.
 *
 * The rows are closed to the anon key, so the store needs PRIVATE_SUPABASE_SERVICE_ROLE_KEY. Without
 * it, or in anonymous mode, this server keeps no help requests and the routes answer 503.
 */
import * as env from "$app/env/private";
import * as publicEnv from "$app/env/public";
import log from "@tutors/logger";
import {
  acknowledgeHelp,
  assistanceClient,
  answerHint,
  helpQueue,
  myHelpRequest,
  requestHelp,
  resolveHelp,
  stepRef,
  supabaseAssistanceFeed,
  supabaseAssistanceStore,
  withdrawHelp,
  type AssistanceDeps,
  type AssistanceClient,
  type HelpRefusal,
  type StepRef
} from "@tutors/community/assistance";

/** The longest hint a lecturer may type. */
const MAX_HINT_LENGTH = 2000;

const clock = { now: () => new Date(), nowMs: () => Date.now() };

let service: AssistanceClient | null | undefined;

/** The service-role client, made once; null when this server keeps no help requests. */
function serviceClient(): AssistanceClient | null {
  if (service !== undefined) return service;
  const url = publicEnv.PUBLIC_SUPABASE_URL;
  const key = env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (publicEnv.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE" || !url || !key) {
    service = null;
    return service;
  }
  service = assistanceClient(url, key);
  return service;
}

/** A Netlify site name: the only course ids the server reads a course from. */
const SITE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Where a course's tutors.json is published, or null for a course id this server will not fetch.
 * Only a bare Netlify site name (`cs101`) or its `<site>.netlify.app` host is read, always over
 * https, so a signed-in caller cannot point the server at a loopback, private or internal host.
 */
export function tutorsJsonUrl(courseId: string): string | null {
  const site = courseId.toLowerCase().endsWith(".netlify.app") ? courseId.slice(0, -".netlify.app".length) : courseId;
  return SITE.test(site) ? `https://${site}.netlify.app/tutors.json` : null;
}

/**
 * What the server needs from a course's published tutors.json: its educators, and who may open it
 * when it is private (properties `auth` 1 or more with a whitelist), else null for anyone signed in.
 */
export type CourseAccess = { educators: string[]; admitted: string[] | null };

const ACCESS_CACHE_MS = 5 * 60 * 1000;
const accessCache = new Map<string, { at: number; access: CourseAccess }>();

const logins = (list: unknown): string[] =>
  Array.isArray(list)
    ? list
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

/**
 * A course's access from its published tutors.json, cached for five minutes; null when it cannot
 * be read (an id the server will not fetch, no such course, or the site down), which is not cached.
 * Redirects are not followed, so a course site cannot send the server elsewhere.
 */
async function courseAccess(courseId: string, fetchFn: typeof fetch): Promise<CourseAccess | null> {
  const cached = accessCache.get(courseId);
  if (cached && Date.now() - cached.at < ACCESS_CACHE_MS) return cached.access;
  const url = tutorsJsonUrl(courseId);
  if (!url) return null;
  try {
    const response = await fetchFn(url, { redirect: "manual" });
    if (!response.ok) return null;
    const course = (await response.json()) as { properties?: { auth?: unknown }; enrollment?: { educators?: unknown; whitelist?: unknown } } | null;
    const educators = logins(course?.enrollment?.educators);
    const whitelist = logins(course?.enrollment?.whitelist);
    const access: CourseAccess = { educators, admitted: Number(course?.properties?.auth) >= 1 && whitelist.length > 0 ? [...educators, ...whitelist] : null };
    accessCache.set(courseId, { at: Date.now(), access });
    return access;
  } catch (error) {
    log.warn("Reading a course's access failed:", courseId, error);
    return null;
  }
}

/** Forgets every course's access read so far, so the next request reads tutors.json again. */
export function forgetCourseAccess(): void {
  accessCache.clear();
}

/** Whether `login` may ask for help in the course: it can be read, and admits them when it is private. */
export async function mayAskIn(courseId: string, login: string, fetchFn: typeof fetch): Promise<boolean> {
  const access = await courseAccess(courseId, fetchFn);
  return access !== null && (access.admitted === null || access.admitted.includes(login));
}

/** The use cases over this server's adapters, or null when it keeps no help requests. */
export function assistance(fetchFn: typeof fetch) {
  const client = serviceClient();
  if (!client) return null;
  const deps: AssistanceDeps = {
    store: supabaseAssistanceStore(client),
    feed: supabaseAssistanceFeed(client),
    clock,
    educatorsOf: async (courseId) => (await courseAccess(courseId, fetchFn))?.educators ?? []
  };
  return {
    request: requestHelp(deps),
    acknowledge: acknowledgeHelp(deps),
    answerHint: answerHint(deps),
    resolve: resolveHelp(deps),
    withdraw: withdrawHelp(deps),
    queue: helpQueue(deps),
    mine: myHelpRequest(deps),
    educatorsOf: deps.educatorsOf
  };
}

/** What a browser posts: a student asking on a step, or anyone acting on a request by id. */
export type HelpPost =
  { action: "request"; ref: StepRef; kind: string } | { action: "acknowledge" | "resolve" | "withdraw"; id: string } | { action: "answer-hint"; id: string; hintText: string };

const text = (value: unknown, max: number): string | null => (typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null);

/** The post, or why it is malformed. */
export function parseHelpPost(body: unknown): HelpPost | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "body is a JSON object";
  const b = body as Record<string, unknown>;
  switch (b.action) {
    case "request": {
      const ref = stepRef(text(b.courseId, 200), text(b.labRoute, 512), text(b.stepId, 200));
      if (!ref) return "courseId, labRoute and stepId are required";
      if (!ref.labRoute.startsWith(`/lab/${ref.courseId}/`)) return "labRoute is a lab of the course, /lab/<courseId>/...";
      if (typeof b.kind !== "string") return "kind is one of stuck, hint, lecturer";
      return { action: "request", ref, kind: b.kind };
    }
    case "acknowledge":
    case "resolve":
    case "withdraw":
    case "answer-hint": {
      const id = text(b.id, 64);
      if (!id) return "id is required";
      if (b.action !== "answer-hint") return { action: b.action, id };
      const hintText = typeof b.hintText === "string" ? b.hintText : "";
      if (hintText.length > MAX_HINT_LENGTH) return `a hint is at most ${MAX_HINT_LENGTH} characters`;
      return { action: "answer-hint", id, hintText };
    }
    default:
      return "action is one of request, acknowledge, answer-hint, resolve, withdraw";
  }
}

/** The status and message each refusal answers with. */
export const HELP_REFUSALS: Record<HelpRefusal, { status: number; message: string }> = {
  invalid: { status: 400, message: "That is not a help request tutors can open" },
  "hint-required": { status: 400, message: "Type a hint to answer a Need-a-hint request" },
  "not-permitted": { status: 403, message: "Only an educator of the course, or the student who asked, may do that" },
  "not-found": { status: 404, message: "No such help request" },
  conflict: { status: 409, message: "The request changed at the same moment; read it again" },
  "not-in-state-table": { status: 409, message: "The request has already moved on" },
  unavailable: { status: 503, message: "The help request was not sent; try again" }
};

/** The largest body POST /api/assistance reads. */
export const MAX_HELP_POST_BYTES = 8 * 1024;

/** A JSON answer no shared cache keeps. */
export function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
}

/** Only the reader's own pages may call these routes: a request from another origin is refused before anything is read. */
export function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === url.origin;
}
