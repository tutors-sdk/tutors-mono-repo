/**
 * The reader server's side of lecturer feedback (/api/feedback): what a signed-in reader may read
 * and what an educator of the course may keep or revoke, answered as a status and a JSON body.
 * Every write runs here as the session's actor, never in a browser (Rule 0565); a reader a private
 * course does not admit is refused (Rule 0567).
 */
import { audienceOf, feedbackFor, newestFirst, stepRef, type Annotation, type StepFeedback, type StepRef } from "../annotation.ts";
import type { FeedbackStore } from "../store.ts";
import { admits, teaches, type CourseAccess } from "./access.ts";

/** The longest annotation body, in characters: an explanation, not a document. */
export const MAX_ANNOTATION_CHARS = 4000;

export type FeedbackApiDeps = {
  /** Null when this server keeps no feedback (anonymous mode, or no service key). */
  store: FeedbackStore | null;
  /** The course's access rules, or null when the course cannot be read. */
  accessOf: (courseId: string) => Promise<CourseAccess | null>;
  now?: () => Date;
};

export type Actor = { login: string } | null;
export type Answer = { status: number; body: Record<string, unknown> };

/** A step as the person signed in sees it, plus every annotation posted on it, newest first, for an educator of the course (Rule 0409). */
export type StepFeedbackView = StepFeedback & { history: Annotation[] | null };

export const FEEDBACK_MESSAGES = {
  signIn: "Sign in with GitHub to read and send feedback",
  notKept: "Feedback is not kept on this server",
  noCourse: "The course could not be read, or is not one this server reads feedback for",
  notAdmitted: "This course does not admit you",
  forbidden: "Only an educator of the course may do that",
  notFound: "No such annotation",
  unavailable: "The feedback was not kept; try again"
} as const;

const fail = (status: number, message: string, reason: string): Answer => ({ status, body: { message, reason } });

const text = (value: unknown, max: number): string | null => (typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null);

/** The step a request names, or why it does not name a lab step. */
export function parseStep(body: Record<string, unknown>): StepRef | string {
  const ref = stepRef(text(body.courseId, 200), text(body.labRoute, 512), text(body.stepId, 200));
  if (!ref) return "courseId, labRoute and stepId are required";
  if (!ref.labRoute.startsWith("/lab/")) return "labRoute is a lab's route, /lab/<courseId>/...";
  return ref;
}

export type FeedbackPost = { action: "annotate"; ref: StepRef; learnerId: string | null; everyone: boolean; body: string } | { action: "revoke"; id: string };

/** What a browser posts, or why it is malformed. */
export function parseFeedbackPost(raw: unknown): FeedbackPost | string {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (body.action === "revoke") {
    const id = text(body.id, 64);
    return id ? { action: "revoke", id } : "id is required";
  }
  if (body.action !== "annotate") return "action is annotate or revoke";
  const ref = parseStep(body);
  if (typeof ref === "string") return ref;
  if (typeof body.body !== "string" || !body.body.trim() || body.body.length > MAX_ANNOTATION_CHARS) return `body is text of 1 to ${MAX_ANNOTATION_CHARS} characters`;
  if (body.everyone !== undefined && typeof body.everyone !== "boolean") return "everyone is true or false";
  const learnerId = body.learnerId === undefined || body.learnerId === null || body.learnerId === "" ? null : text(body.learnerId, 200);
  if (learnerId === null && body.learnerId !== undefined && body.learnerId !== null && body.learnerId !== "") return "learnerId is a GitHub login";
  return { action: "annotate", ref, learnerId, everyone: body.everyone === true, body: body.body.trim() };
}

export function feedbackApi({ store, accessOf, now = () => new Date() }: FeedbackApiDeps) {
  /** The course's access rules, or the answer refusing the request: 503 when it cannot be read, 403 when it does not admit `login`. */
  async function admitted(courseId: string, login: string): Promise<CourseAccess | Answer> {
    const access = await accessOf(courseId).catch(() => null);
    if (!access) return fail(503, FEEDBACK_MESSAGES.noCourse, "no-course");
    return admits(access, login) ? access : fail(403, FEEDBACK_MESSAGES.notAdmitted, "forbidden");
  }
  const refused = (value: CourseAccess | Answer): value is Answer => "status" in value;

  /** The checks every request makes first: someone is signed in and this server keeps feedback. */
  function gate(actor: Actor): Answer | null {
    if (!actor?.login) return fail(401, FEEDBACK_MESSAGES.signIn, "signed-out");
    if (!store) return fail(503, FEEDBACK_MESSAGES.notKept, "not-kept");
    return null;
  }

  return {
    /** GET /api/feedback: one read of the step's annotations, shown as the actor may see them (Rule 0403). */
    async step(query: Record<string, unknown>, actor: Actor): Promise<Answer> {
      const closed = gate(actor);
      if (closed) return closed;
      const ref = parseStep(query);
      if (typeof ref === "string") return fail(400, ref, "invalid");
      const access = await admitted(ref.courseId, actor!.login);
      if (refused(access)) return access;
      let annotations: Annotation[];
      try {
        annotations = await store!.forStep(ref);
      } catch {
        return fail(503, FEEDBACK_MESSAGES.unavailable, "unavailable");
      }
      const view: StepFeedbackView = { ...feedbackFor(annotations, actor!.login), history: teaches(access, actor!.login) ? newestFirst(annotations) : null };
      return { status: 200, body: view };
    },

    /** GET /api/feedback/mine: what the actor received in a course, broadcasts included, newest first (Rule 0409). */
    async mine(courseId: unknown, actor: Actor): Promise<Answer> {
      const closed = gate(actor);
      if (closed) return closed;
      const id = text(courseId, 200);
      if (!id) return fail(400, "courseId is required", "invalid");
      const access = await admitted(id, actor!.login);
      if (refused(access)) return access;
      try {
        return { status: 200, body: { annotations: await store!.received(id, actor!.login) } };
      } catch {
        return fail(503, FEEDBACK_MESSAGES.unavailable, "unavailable");
      }
    },

    /**
     * POST /api/feedback: an educator of the course annotates a step for one student or everyone on
     * it, stored with them as author and the time (Rules 0400, 0401), or revokes an annotation
     * (Rule 0406). Anyone else is refused with 403 and nothing is stored (Rule 0402).
     */
    async post(raw: unknown, actor: Actor): Promise<Answer> {
      const closed = gate(actor);
      if (closed) return closed;
      const post = parseFeedbackPost(raw);
      if (typeof post === "string") return fail(400, post, "invalid");
      const login = actor!.login;
      if (post.action === "revoke") {
        let found: Annotation | null;
        try {
          found = await store!.get(post.id);
        } catch {
          return fail(503, FEEDBACK_MESSAGES.unavailable, "unavailable");
        }
        if (!found) return fail(404, FEEDBACK_MESSAGES.notFound, "not-found");
        const access = await accessOf(found.ref.courseId).catch(() => null);
        if (!access) return fail(503, FEEDBACK_MESSAGES.noCourse, "no-course");
        if (!teaches(access, login)) return fail(403, FEEDBACK_MESSAGES.forbidden, "forbidden");
        try {
          const revoked = await store!.revoke(post.id, now().toISOString());
          return revoked ? { status: 200, body: { annotation: revoked } } : fail(404, FEEDBACK_MESSAGES.notFound, "not-found");
        } catch {
          return fail(503, FEEDBACK_MESSAGES.unavailable, "unavailable");
        }
      }
      const access = await accessOf(post.ref.courseId).catch(() => null);
      if (!access) return fail(503, FEEDBACK_MESSAGES.noCourse, "no-course");
      if (!teaches(access, login)) return fail(403, FEEDBACK_MESSAGES.forbidden, "forbidden");
      const audience = audienceOf({ learnerId: post.learnerId, everyone: post.everyone });
      if (typeof audience === "string") return fail(400, audience === "no-audience" ? "name a student or everyone" : "a student or everyone, not both", "invalid");
      try {
        const annotation = await store!.annotate({ ref: post.ref, audience, body: post.body, authorId: login, createdAt: now().toISOString() });
        return { status: 201, body: { annotation } };
      } catch {
        return fail(503, FEEDBACK_MESSAGES.unavailable, "unavailable");
      }
    }
  };
}
