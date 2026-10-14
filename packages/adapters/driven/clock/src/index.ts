export { now, nowMs, clockStatus, announceClock, CLOCK_ENV, type ClockStatus } from "./clock.ts";
export { versionInfo, versionEndpoint, type VersionInfo, type VersionOptions } from "./version.ts";
import type { Clock } from "@tutors/application/ports";
import { now, nowMs } from "./clock.ts";

/** The application's Clock port over the HARNESS_NOW seam. */
export const clock: Clock = { now, nowMs };
