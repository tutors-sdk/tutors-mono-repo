/**
 * GET /metrics: this process's Prometheus metrics, served by @tutors/metrics.
 * When METRICS_TOKEN is set, a scrape must send Authorization: Bearer <token> or gets 401.
 * When it is unset the endpoint is open to anyone who can reach the app.
 */
import type { RequestHandler } from "./$types";
import { metricsEndpoint } from "@tutors/metrics";

export const GET: RequestHandler = ({ request }) => metricsEndpoint({ request });
