import type { LogEntry } from "./types.ts";

export function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export function formatPretty(entry: LogEntry): string {
  const { timestamp, level, message, app, ...context } = entry;
  const scope = typeof app === "string" && app.length > 0 ? app : "tutors";
  const prefix = `[${timestamp}] [${scope}:${level}]`;
  const contextStr =
    Object.keys(context).length > 0 ? " " + JSON.stringify(context) : "";
  return `${prefix} ${message}${contextStr}`;
}
