/** The instant, so the current week, "today" and timestamps can be frozen in tests and the release harness. */
export interface Clock {
  now(): Date;
  nowMs(): number;
}
