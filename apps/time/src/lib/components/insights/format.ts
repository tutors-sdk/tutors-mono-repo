import type { HelpKind } from "@tutors/community/assistance";
import type { InsightsRefusal } from "@tutors/insights";
import type { MessageKey } from "@tutors/i18n";

/** How Tutors Time writes an insights number: seconds as "45 s" or "3.5 min", and nothing as a dash. */
export function duration(seconds: number | null, units: { seconds: string; minutes: string }): string {
  if (seconds === null) return "–";
  if (seconds < 120) return `${seconds} ${units.seconds}`;
  return `${(Math.round(seconds / 6) / 10).toLocaleString()} ${units.minutes}`;
}

/** A step as a lecturer names it: the lab's last route segment and the step's id. */
export function stepName(labRoute: string, stepId: string): string {
  const lab = labRoute.split("/").filter(Boolean).at(-1) ?? labRoute;
  return `${lab} / ${stepId}`;
}

/** The kinds of help in the order a page shows them, with their labels. */
export const KIND_LABELS = { stuck: "insights.kind.stuck", hint: "insights.kind.hint", lecturer: "insights.kind.lecturer" } as const satisfies Record<HelpKind, MessageKey>;
export const KINDS = Object.keys(KIND_LABELS) as HelpKind[];

/** The one message a page shows for each refusal; without the insights views it says so and nothing else breaks (Rule 0416). */
export const REFUSAL_MESSAGES = {
  "signed-out": "insights.signedOut",
  forbidden: "insights.forbidden",
  "not-kept": "insights.notKept",
  "not-ready": "insights.notReady",
  invalid: "insights.unavailable",
  unavailable: "insights.unavailable"
} as const satisfies Record<InsightsRefusal, MessageKey>;
