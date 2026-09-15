import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkSupabase, getRecentErrorCounts } from "@tutors/community/utils/health-check";

export const GET: RequestHandler = async () => {
  const [supabaseCheck, errorCounts] = await Promise.all([checkSupabase(), getRecentErrorCounts()]);

  const overallStatus = supabaseCheck.status === "ok" || supabaseCheck.status === "skipped" ? "ok" : "degraded";

  return json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    app: "tutors-live",
    checks: {
      supabase: supabaseCheck
    },
    errors: {
      last60min: errorCounts
    }
  });
};
