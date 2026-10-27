/**
 * Liveness probe: GET /healthz/live always answers 200 {"status":"ok"} while the process can serve HTTP.
 * Used by the Kubernetes startup and liveness probes. It checks no dependencies, so a failure points at the
 * Node process (or the pod network), never at Supabase or a course host. Not logged by the request logger and not counted in metrics.
 */
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  return json({ status: "ok" });
};
