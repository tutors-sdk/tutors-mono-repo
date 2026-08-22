import type { LogEntry } from "@tutors/logger";
import { supabase } from "./supabase-client.ts";

let buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 20;

function buildRow(entry: LogEntry, appName: string) {
  const { timestamp, level, message, app, ...rest } = entry;
  return {
    app: appName,
    level: String(level),
    message,
    context: Object.keys(rest).length > 0 ? rest : {},
    url: typeof window !== "undefined" ? window.location.href : null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    course_id: (entry.courseId as string) ?? null,
    student_id: (entry.studentId as string) ?? null
  };
}

async function flush(appName: string) {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0);

  if (typeof supabase === "undefined") return;

  try {
    await supabase.from("app_errors").insert(batch.map((e) => buildRow(e, appName)));
  } catch {
    // transport failures must never crash the app
  }
}

function scheduleFlush(appName: string) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush(appName);
  }, FLUSH_INTERVAL_MS);
}

export function createSupabaseErrorTransport(appName: string): (entry: LogEntry) => void {
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => flush(appName));
  }

  return (entry: LogEntry) => {
    if (entry.level !== "warn" && entry.level !== "error") return;
    if (typeof supabase === "undefined") return;

    buffer.push(entry);
    if (buffer.length >= MAX_BUFFER_SIZE) {
      flush(appName);
    } else {
      scheduleFlush(appName);
    }
  };
}
