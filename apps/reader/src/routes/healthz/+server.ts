import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkSupabase, getRecentErrorCounts } from "@tutors/community/utils/health-check";
import { now } from "@tutors/runtime";

export const GET: RequestHandler = async () => {
  const [supabaseCheck, errorCounts] = await Promise.all([checkSupabase(), getRecentErrorCounts()]);

  const overallStatus = supabaseCheck.status === "ok" || supabaseCheck.status === "skipped" ? "ok" : "degraded";

  return json({
    status: overallStatus,
    timestamp: now().toISOString(),
    app: "tutors-reader",
    checks: {
      supabase: supabaseCheck
    },
    errors: {
      last60min: errorCounts
    }
  });
};
