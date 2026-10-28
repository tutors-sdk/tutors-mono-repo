/**
 * Logger transport that copies browser warn and error lines into the Supabase app_errors table.
 * Registered by each app's hooks.client.ts. Lines are batched (sent after 5 seconds or at 20 lines) and
 * flushed on page unload with a keepalive fetch, sent without credentials. Does nothing when Supabase is not
 * configured, and insert failures are ignored.
 */
import type { LogEntry } from "@tutors/logger";
import { supabase } from "./supabase-client.ts";
import * as env from "$app/env/public";

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

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (typeof supabase === "undefined") return;

  try {
    await supabase.from("app_errors").insert(batch.map((e) => buildRow(e, appName)));
  } catch {
    // transport failures must never crash the app
  }
}

function flushOnUnload(appName: string) {
  if (buffer.length === 0 || typeof window === "undefined") return;
  const batch = buffer.splice(0);

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const rows = batch.map((e) => buildRow(e, appName));
  const payload = JSON.stringify(rows);
  // Only the key goes in the query string: the gateway takes it from there, but PostgREST reads any other
  // parameter as a column filter, so `?Prefer=...` is rejected with 400 (PGRST100) and the rows are lost.
  const url = `${env.PUBLIC_SUPABASE_URL}/rest/v1/app_errors?apikey=${env.PUBLIC_SUPABASE_ANON_KEY}`;

  // A keepalive fetch outlives the page like sendBeacon does, but sendBeacon always sends credentials, and the
  // gateway answers `Access-Control-Allow-Origin: *`, which a browser refuses for a credentialed request: every
  // beacon was blocked on CORS. Without credentials the wildcard is accepted.
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: payload,
    keepalive: true,
    credentials: "omit"
  }).catch(() => {
    // best-effort flush on unload; nothing more we can do
  });
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
    window.addEventListener("beforeunload", () => flushOnUnload(appName));
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
