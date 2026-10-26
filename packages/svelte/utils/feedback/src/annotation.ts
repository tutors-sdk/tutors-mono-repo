/**
 * Lecturer feedback: an annotation anchored to one lab step and addressed to one student or to
 * everyone on the step (Rule 0400). An annotation to everyone is a broadcast: an explanation shown
 * as a banner on the step and toasted to the course's students elsewhere in it.
 */

/** A lab step: the course, the lab's route (`/lab/<courseId>/...`) and the step's id in it. */
export type StepRef = { courseId: string; labRoute: string; stepId: string };

export type Audience = { kind: "student"; learnerId: string } | { kind: "everyone" };

export type Annotation = {
  id: string;
  ref: StepRef;
  audience: Audience;
  /** Markdown, rendered and sanitised as lab content is (Rule 0408). */
  body: string;
  authorId: string;
  createdAt: string;
  revokedAt: string | null;
};

export type NewAnnotation = Omit<Annotation, "id" | "revokedAt">;

/** Who a lecturer's composer says the annotation is for. */
export type AudienceInput = { learnerId?: string | null; everyone?: boolean };

export type AudienceRefusal = "two-audiences" | "no-audience";

const present = (s: string | null | undefined): s is string => typeof s === "string" && s.trim().length > 0;

/** The step, or null when any part of it is missing. */
export function stepRef(courseId: string | null | undefined, labRoute: string | null | undefined, stepId: string | null | undefined): StepRef | null {
  if (!present(courseId) || !present(labRoute) || !present(stepId)) return null;
  return { courseId: courseId.trim(), labRoute: labRoute.trim(), stepId: stepId.trim() };
}

export function sameStep(a: StepRef, b: StepRef): boolean {
  return a.courseId === b.courseId && a.labRoute === b.labRoute && a.stepId === b.stepId;
}

/** The one audience the input names: a student, or everyone on the step. */
export function audienceOf(input: AudienceInput): Audience | AudienceRefusal {
  const student = present(input.learnerId);
  if (student && input.everyone) return "two-audiences";
  if (student) return { kind: "student", learnerId: input.learnerId!.trim() };
  if (input.everyone) return { kind: "everyone" };
  return "no-audience";
}

export function isBroadcast(annotation: Pick<Annotation, "audience">): boolean {
  return annotation.audience.kind === "everyone";
}

export function isRevoked(annotation: Pick<Annotation, "revokedAt">): boolean {
  return annotation.revokedAt !== null;
}

/** True when the annotation is for this learner: addressed to them, or to everyone on its step. */
export function isFor(annotation: Pick<Annotation, "audience">, learnerId: string): boolean {
  return annotation.audience.kind === "everyone" || annotation.audience.learnerId === learnerId;
}

/** What a student sees at a step: the broadcasts above the content and what was addressed to them below it (Rule 0403). */
export type StepFeedback = { broadcasts: Annotation[]; personal: Annotation[] };

/**
 * A student's view of a step's annotations, from the one read of the step: unrevoked broadcasts and
 * the unrevoked annotations addressed to `learnerId`, oldest first. Another student's annotation
 * is never in it.
 */
export function feedbackFor(annotations: readonly Annotation[], learnerId: string): StepFeedback {
  const shown = annotations.filter((a) => !isRevoked(a) && isFor(a, learnerId)).sort(oldestFirst);
  return { broadcasts: shown.filter(isBroadcast), personal: shown.filter((a) => !isBroadcast(a)) };
}

export function oldestFirst(a: Pick<Annotation, "createdAt" | "id">, b: Pick<Annotation, "createdAt" | "id">): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Newest first, as a history reads (Rule 0409). */
export function newestFirst<T extends Pick<Annotation, "createdAt" | "id">>(annotations: readonly T[]): T[] {
  return [...annotations].sort((a, b) => oldestFirst(b, a));
}
