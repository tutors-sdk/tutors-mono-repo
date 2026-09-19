/**
 * The server-side clock seam.
 *
 * Anything the server stamps into a response or a stored record (a health
 * payload's timestamp, "last synced" columns, refresh-interval maths) reads
 * the time from here. Normally that is the system clock. When the release
 * harness sets `HARNESS_NOW` to an ISO 8601 instant, every call answers that
 * instant instead, so two stacks of the same image produce identical bytes.
 *
 * Deliberately NOT for: log timestamps, metrics, request durations, token or
 * session expiry, or any other security decision. Those must follow real time;
 * a frozen clock there would hide latency or keep an expired session alive.
 * Nothing in this module patches `Date`, so code that does not import it (all
 * of Auth.js, for one) is unaffected.
 */

export const CLOCK_ENV = "HARNESS_NOW";

type Env = Record<string, string | undefined>;

/** A full ISO 8601 instant with an explicit offset; `Date.parse` alone accepts far too much ("1", "March"). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

function serverEnv(): Env {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

export type ClockStatus =
  | { mode: "system" }
  | { mode: "frozen"; instant: string }
  /** `HARNESS_NOW` was set but is not an ISO instant; it is ignored and the system clock is used. */
  | { mode: "system"; rejected: string };

/** How the clock is configured. Read at call time, never cached: `$env/dynamic` semantics. */
export function clockStatus(env: Env = serverEnv()): ClockStatus {
  const raw = env[CLOCK_ENV]?.trim();
  if (!raw) return { mode: "system" };
  const ms = ISO_INSTANT.test(raw) ? Date.parse(raw) : Number.NaN;
  if (Number.isNaN(ms)) return { mode: "system", rejected: raw };
  return { mode: "frozen", instant: new Date(ms).toISOString() };
}

/** The current instant: `HARNESS_NOW` when it is set and valid, the system clock otherwise. */
export function now(env: Env = serverEnv()): Date {
  const status = clockStatus(env);
  return status.mode === "frozen" ? new Date(status.instant) : new Date();
}

/** `now()` as epoch milliseconds, the drop-in for `Date.now()`. */
export function nowMs(env: Env = serverEnv()): number {
  return now(env).getTime();
}

/**
 * Say so, loudly, when the clock is not the system clock. Call once from the
 * app's `init` hook. A frozen clock in a real deployment is a misconfiguration
 * (every record would carry the same timestamp), so this is a `warn`, and the
 * state is also visible as `clock` on `GET /version`.
 */
export function announceClock(logger: { warn(message: string, data?: unknown): void }, env: Env = serverEnv()): ClockStatus {
  const status = clockStatus(env);
  if (status.mode === "frozen") {
    logger.warn(`${CLOCK_ENV} is set: the server clock is FROZEN for response and record timestamps. Only the release harness should set this; unset it in any real deployment.`, {
      frozenAt: status.instant
    });
  } else if ("rejected" in status) {
    logger.warn(`${CLOCK_ENV} is set but is not an ISO 8601 instant (e.g. 2026-09-16T09:05:00.000Z); ignoring it and using the system clock.`, {
      value: status.rejected.slice(0, 64)
    });
  }
  return status;
}
