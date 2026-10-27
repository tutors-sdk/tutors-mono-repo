/**
 * Public entry point of @tutors/runtime: the server clock seam (frozen when HARNESS_NOW is set) and
 * the build version info.
 */
export { now, nowMs, clockStatus, announceClock, CLOCK_ENV, type ClockStatus } from "./clock.ts";
export { versionInfo, versionEndpoint, type VersionInfo, type VersionOptions } from "./version.ts";
