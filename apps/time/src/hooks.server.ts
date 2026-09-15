/* global APP_VERSION */
import type { HandleServerError, ServerInit } from "@sveltejs/kit";
import { createRequestLogger, logRequestError, logServiceStart, setAppName } from "@tutors/logger";

setAppName("tutors-time");

export const init: ServerInit = async () => {
  logServiceStart({ version: APP_VERSION });
};

export const handle = createRequestLogger();

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  logRequestError({ error, event, status, message });
  return {
    message: "An unexpected error occurred"
  };
};
