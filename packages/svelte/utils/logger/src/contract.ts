/**
 * The log contract as data, so the container smoke test, the contract tests
 * and the documentation (deploy/README.md, "Log contract") cannot drift apart.
 */

/**
 * Keys that follow the core keys, in order, for each `event` kind the logger
 * package itself emits. `optional` keys are constant per app (the reader's
 * `authMode`), never per request. Lines written with a plain `log.info(...)`
 * have `event: "log"` and whatever context their call site passes.
 */
export const LOG_EVENT_FIELDS: Readonly<Record<string, { required: readonly string[]; optional?: readonly string[] }>> = {
  "service.start": { required: ["logLevel", "node", "version"], optional: ["authMode"] },
  "request.completed": { required: ["method", "path", "route", "status", "duration_ms", "slow", "loadError"] },
  "request.error": { required: ["method", "path", "route", "status", "reason", "error", "stack"] },
  "request.failed": { required: ["method", "path", "route", "duration_ms", "error", "stack"] },
  console: { required: ["consoleMethod"] },
  "process.uncaughtException": { required: ["error", "stack"] },
  "process.unhandledRejection": { required: ["error", "stack"] },
  "process.warning": { required: ["warningName", "error", "stack"] },
};

/**
 * Fields whose VALUE legitimately differs between two runs of the same image
 * under the same traffic. Everything else, and every key name, is stable.
 * `slow` is here because it is derived from `duration_ms` (and takes `level`
 * to warn with it); `stack` because frames name content-hashed build paths.
 */
export const VARIABLE_LOG_FIELDS = ["timestamp", "hostname", "pid", "requestId", "duration_ms", "slow", "stack"] as const;
