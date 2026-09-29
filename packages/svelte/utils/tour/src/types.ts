import type { MessageKey } from "@tutors/i18n";

export type TourPlacement = "top" | "bottom" | "left" | "right";

/**
 * The kinds of page the tour has something of its own to say about. Everything else - a note, a
 * talk, a video, the search page - gets the shell steps and nothing more, under "other".
 */
export type TourPageKind = "course" | "topic" | "lab" | "other";

export interface TourStep {
  target: string;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  placement: TourPlacement;
  optional?: boolean;
}
