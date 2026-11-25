import type { MessageKey } from "@tutors/i18n";

export type TourPlacement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  target: string;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  placement: TourPlacement;
  optional?: boolean;
}
