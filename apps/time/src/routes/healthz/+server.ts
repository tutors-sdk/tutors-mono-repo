import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkSupabase, getRecentErrorCounts } from "@tutors/store-supabase";
import { now } from "@tutors/clock";
import * as env from "$app/env/private";
import * as publicEnv from "$app/env/public";
import { checkEnvironment } from "@tutors/app-config/env-contract";
import { readinessReport } from "@tutors/app-config/readiness";

export const GET: RequestHandler = async () => {
  const [supabaseCheck, errorCounts] = await Promise.all([checkSupabase(), getRecentErrorCounts()]);

  // Rule 0684: a deployment missing a variable it needs is not ready. The names are listed, never the values.
  const environment = checkEnvironment("time", { ...publicEnv, ...env });
  const report = readinessReport({ app: "tutors-time", timestamp: now().toISOString(), environment, dependencies: { supabase: supabaseCheck }, errors: errorCounts });
  return json(report.body, { status: report.status });
};
