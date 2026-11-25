import type { Clock } from "@tutors/application/ports";

/**
 * The instant the server stores stamp rows with. The app's server composition root installs its
 * Clock port (the HARNESS_NOW seam, in the reader), so a frozen clock freezes what is stored; an
 * adapter does not import another adapter to find the time.
 */
let current: () => Date = () => new Date();

export function useServerClock(clock: Pick<Clock, "now">): void {
  current = () => clock.now();
}

export function serverNow(): Date {
  return current();
}
