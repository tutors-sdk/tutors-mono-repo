import type { RequestHandler } from "./$types";
import { metricsEndpoint } from "@tutors/metrics";

export const GET: RequestHandler = () => metricsEndpoint();
