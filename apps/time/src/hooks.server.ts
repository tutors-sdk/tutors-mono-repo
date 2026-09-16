/* global APP_VERSION */
import type { HandleServerError, ServerInit } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { createRequestLogger, logRequestError, logServiceStart, setAppName } from "@tutors/logger";
import { metricsHandle } from "@tutors/metrics";

setAppName("tutors-time");

export const init: ServerInit = async () => {
  logServiceStart({ version: APP_VERSION });
};

export const handle = sequence(createRequestLogger(), metricsHandle);

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  logRequestError({ error, event, status, message });
  return {
    message: "An unexpected error occurred"
  };
};
