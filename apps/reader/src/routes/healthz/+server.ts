import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkSupabase, getRecentErrorCounts, HEALTH_CHECK_TIMEOUT_MS } from "@tutors/community/utils/health-check";
import { now } from "@tutors/runtime";
import * as env from "$app/env/private";
import * as publicEnv from "$app/env/public";
import { checkEnvironment, isAnonymous } from "@tutors/app-config/env-contract";
import { checkServiceKey } from "@tutors/app-config/service-key";

/**
 * Rule 0690: the service-role key the /api routes use, checked by value. "rejected" (not a service-role key, or
 * Supabase answers 401/403) makes the reader unready; "unreachable" is Supabase being down and only degrades it,
 * like the Supabase check (Rule 0616). Skipped in anonymous mode and when the key is missing (Rule 0684 reports that).
 */
async function serviceKeyCheck(values: Record<string, string | undefined>) {
  if (isAnonymous(values)) return { status: "skipped" as const };
  const result = await checkServiceKey({ url: values.PUBLIC_SUPABASE_URL, key: values.PRIVATE_SUPABASE_SERVICE_ROLE_KEY, timeoutMs: HEALTH_CHECK_TIMEOUT_MS });
  return result.status === "missing" ? { status: "skipped" as const } : result;
}

export const GET: RequestHandler = async () => {
  const values = { ...publicEnv, ...env };
  const [supabaseCheck, errorCounts, serviceKey] = await Promise.all([checkSupabase(), getRecentErrorCounts(), serviceKeyCheck(values)]);

  // Rule 0684: a deployment missing a variable it needs is not ready. The names are listed, never the values.
  const environment = checkEnvironment("reader", values);
  const ready = environment.status === "ok" && serviceKey.status !== "rejected";
  const supabaseOk = (supabaseCheck.status === "ok" || supabaseCheck.status === "skipped") && serviceKey.status !== "unreachable";
  const overallStatus = !ready ? "misconfigured" : supabaseOk ? "ok" : "degraded";

  return json({
    status: overallStatus,
    timestamp: now().toISOString(),
    app: "tutors-reader",
    checks: {
      environment,
      serviceKey,
      supabase: supabaseCheck
    },
    errors: {
      last60min: errorCounts
    }
  }, { status: ready ? 200 : 503 });
};
