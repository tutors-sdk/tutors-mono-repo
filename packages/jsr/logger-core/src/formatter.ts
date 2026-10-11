import type { LogEntry } from "./types.ts";
import { safeStringify } from "./errors.ts";

/** One entry, one line: JSON escapes every newline, and unserialisable context never throws. */
export function formatJson(entry: LogEntry): string {
  return safeStringify(entry);
}

export function formatPretty(entry: LogEntry): string {
  const { timestamp, level, message, app, ...context } = entry;
  const scope = typeof app === "string" && app.length > 0 ? app : "tutors";
  const prefix = `[${timestamp}] [${scope}:${level}]`;
  const contextStr = Object.keys(context).length > 0 ? " " + safeStringify(context) : "";
  return `${prefix} ${message}${contextStr}`;
}

/** Keys a person at a terminal does not need: who and where are in the prefix or irrelevant there. */
const CLI_HIDDEN_KEYS: ReadonlySet<string> = new Set([
  "timestamp",
  "level",
  "message",
  "app",
  "event",
  "environment",
  "hostname",
  "pid",
  "requestId",
  "error",
  "stack",
]);

/**
 * A line for a person at a terminal: no timestamp or runtime fields, just who is
 * speaking, how loudly, what went wrong and the values it concerns, as in
 * `tutors warn: unable to locate file (path=topic-01/talk.md)`. Used once a CLI
 * calls `useCliOutput`.
 */
export function formatCli(entry: LogEntry): string {
  const scope = typeof entry.app === "string" && entry.app.length > 0 ? entry.app : "tutors";
  const detail = typeof entry.error === "string" && entry.error.length > 0 && entry.error !== entry.message ? `: ${entry.error}` : "";
  const fields = Object.entries(entry)
    .filter(([key, value]) => !CLI_HIDDEN_KEYS.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : safeStringify(value)}`);
  const context = fields.length > 0 ? ` (${fields.join(", ")})` : "";
  return `${scope} ${entry.level}: ${entry.message}${detail}${context}`;
}
