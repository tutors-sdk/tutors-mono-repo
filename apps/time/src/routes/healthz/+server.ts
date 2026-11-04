import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkSupabase, getRecentErrorCounts } from "@tutors/community/utils/health-check";
import { now } from "@tutors/runtime";
import * as env from "$app/env/private";
import * as publicEnv from "$app/env/public";
import { checkEnvironment } from "@tutors/app-config/env-contract";

export const GET: RequestHandler = async () => {
  const [supabaseCheck, errorCounts] = await Promise.all([checkSupabase(), getRecentErrorCounts()]);

  // Rule 0684: a deployment missing a variable it needs is not ready. The names are listed, never the values.
  const environment = checkEnvironment("time", { ...publicEnv, ...env });
  const supabaseOk = supabaseCheck.status === "ok" || supabaseCheck.status === "skipped";
  const overallStatus = environment.status !== "ok" ? "misconfigured" : supabaseOk ? "ok" : "degraded";

  return json({
    status: overallStatus,
    timestamp: now().toISOString(),
    app: "tutors-time",
    checks: {
      environment,
      supabase: supabaseCheck
    },
    errors: {
      last60min: errorCounts
    }
  }, { status: environment.status === "ok" ? 200 : 503 });
};
