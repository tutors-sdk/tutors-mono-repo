import { cellColorForMinutes } from "@tutors/tutors-time-lib";

/** Heat-scale cell style: empty cells stay transparent, tinted cells keep dark ink in both appearances. */
export function heatStyle(minutes: number | null | undefined): string {
  return minutes ? `background-color: ${cellColorForMinutes(minutes)}; color: var(--ink);` : "";
}
