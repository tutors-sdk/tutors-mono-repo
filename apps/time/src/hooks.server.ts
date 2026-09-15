import type { HandleServerError } from "@sveltejs/kit";
import log from "@tutors/logger";

export const handleError: HandleServerError = ({ error }) => {
  log.error("Server error:", error instanceof Error ? error : { details: error });
  return {
    message: "An unexpected error occurred"
  };
};
