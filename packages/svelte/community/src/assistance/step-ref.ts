/**
 * The lab step a help request is about: the course, the lab's route and the step's id. It is a
 * value, compared by its three parts; nothing else identifies a step.
 */
export type StepRef = {
  readonly courseId: string;
  /** The lab's route in the reader, for example `/lab/cs101/lab-01`. */
  readonly labRoute: string;
  /** The step's id within the lab, for example `02`. */
  readonly stepId: string;
};

const part = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The reference to a step, or null when any of its three parts is missing or blank. */
export function stepRef(courseId: unknown, labRoute: unknown, stepId: unknown): StepRef | null {
  const c = part(courseId);
  const l = part(labRoute);
  const s = part(stepId);
  return c && l && s ? { courseId: c, labRoute: l, stepId: s } : null;
}

/** True when `value` is a step reference with all three parts present. */
export function isStepRef(value: unknown): value is StepRef {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return stepRef(v.courseId, v.labRoute, v.stepId) !== null;
}

/** True when two references name the same step of the same lab and course. */
export function sameStep(a: StepRef, b: StepRef): boolean {
  return a.courseId === b.courseId && a.labRoute === b.labRoute && a.stepId === b.stepId;
}
