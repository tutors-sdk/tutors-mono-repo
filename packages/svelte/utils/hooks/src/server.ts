import { json, type Handle, type HandleServerError, type RequestHandler } from "@sveltejs/kit";
import log from "@tutors/logger";
import { checkSupabase, getRecentErrorCounts } from "@tutors/community/utils/health-check";

export const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export function createServerErrorHandler(): HandleServerError {
  return ({ error }) => {
    log.error("Server error:", error instanceof Error ? error : { details: error });
    return {
      message: "An unexpected error occurred"
    };
  };
}

/**
 * GET handler for an app's /healthz route.
 *
 * Reports Supabase reachability and the last hour's error counts. The
 * response is always 200 with a status of "ok" or "degraded"; use a
 * separate liveness probe for orchestration restarts.
 *
 * @param appName - identifier reported in the payload, e.g. "tutors-reader"
 */
export function createHealthzHandler(appName: string): RequestHandler {
  return async () => {
    const [supabaseCheck, errorCounts] = await Promise.all([checkSupabase(), getRecentErrorCounts()]);

    const overallStatus = supabaseCheck.status === "ok" || supabaseCheck.status === "skipped" ? "ok" : "degraded";

    return json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      app: appName,
      checks: {
        supabase: supabaseCheck
      },
      errors: {
        last60min: errorCounts
      }
    });
  };
}
