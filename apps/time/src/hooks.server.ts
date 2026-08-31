import type { HandleServerError } from "@sveltejs/kit";
import log from "@tutors/logger";
import { metricsHandle } from "@tutors/metrics";

export const handle = metricsHandle;

export const handleError: HandleServerError = ({ error }) => {
  log.error("Server error:", error instanceof Error ? error : { details: error });
  return {
    message: "An unexpected error occurred"
  };
};
