/**
 * Supabase checks for the readiness route (/healthz) of each app: a head count on
 * tutors-connect-courses with its latency, and the last 60 minutes of error counts from the
 * get_error_counts RPC. Without a Supabase client the check reports "skipped" and the counts are empty.
 */
import { supabase } from "./supabase-client.ts";

interface CheckResult {
  status: "ok" | "error" | "skipped";
  latencyMs: number;
  message?: string;
}

export async function checkSupabase(): Promise<CheckResult> {
  if (typeof supabase === "undefined") {
    return { status: "skipped", latencyMs: 0, message: "anon mode" };
  }

  const start = performance.now();
  try {
    const { error } = await supabase.from("tutors-connect-courses").select("count", { count: "exact", head: true });
    const latencyMs = Math.round(performance.now() - start);
    if (error) {
      return { status: "error", latencyMs, message: error.message };
    }
    return { status: "ok", latencyMs };
  } catch (e) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      message: e instanceof Error ? e.message : String(e)
    };
  }
}

export async function getRecentErrorCounts(): Promise<{ app: string; level: string; count: number }[]> {
  if (typeof supabase === "undefined") return [];

  try {
    const { data, error } = await supabase.rpc("get_error_counts", { minutes_ago: 60 });
    if (error) return [];
    return (data ?? []) as { app: string; level: string; count: number }[];
  } catch {
    return [];
  }
}
