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
  const contextStr =
    Object.keys(context).length > 0 ? " " + safeStringify(context) : "";
  return `${prefix} ${message}${contextStr}`;
}
