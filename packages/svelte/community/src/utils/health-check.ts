/**
 * Supabase checks for the readiness route (/healthz) of each app: a head count on
 * tutors-connect-courses with its latency, and the last 60 minutes of error counts from the
 * get_error_counts RPC, each abandoned after HEALTH_CHECK_TIMEOUT_MS. Without a Supabase client the check reports "skipped" and the counts are empty.
 */
import { supabase } from "./supabase-client.ts";

/**
 * How long the readiness check waits for Supabase. Kubernetes gives the probe 3 seconds (deploy/k8s/base/deployment.yaml):
 * a check that waited longer would time the probe out, and a stalled database would take every pod out of service,
 * anonymous readers included. So the check gives up first and answers "degraded" (Rule 0616).
 */
export const HEALTH_CHECK_TIMEOUT_MS = 2_000;

/** The query's answer, or a rejection once HEALTH_CHECK_TIMEOUT_MS has passed without one. */
async function withinDeadline<T>(query: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${HEALTH_CHECK_TIMEOUT_MS} ms`)), HEALTH_CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(query), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

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
    const { error } = await withinDeadline(supabase.from("tutors-connect-courses").select("count", { count: "exact", head: true }));
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
    const { data, error } = await withinDeadline(supabase.rpc("get_error_counts", { minutes_ago: 60 }));
    if (error) return [];
    return (data ?? []) as { app: string; level: string; count: number }[];
  } catch {
    return [];
  }
}
