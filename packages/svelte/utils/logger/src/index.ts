/**
 * @tutors/logger is the apps' logger: everything in @tutors/logger-core (levels,
 * child loggers, transports, formats, request context), plus the server glue a
 * SvelteKit app needs (request logging, process and console capture, outbound
 * request ids) and the log contract. The core lives in packages/jsr/logger-core
 * so the Deno packages log through the same default logger and transports.
 */
import log from "@tutors/logger-core";

export * from "@tutors/logger-core";
export type { RequestLikeEvent, RequestLoggerOptions, RequestErrorInput } from "./types.ts";
export { createRequestLogger, logRequestError, requestIdFrom, levelForStatus, REQUEST_ID_HEADER } from "./request-logger.ts";
export { installProcessLogging, type ProcessLoggingOptions } from "./process.ts";
export { withRequestId } from "./outbound.ts";
export { LOG_EVENT_FIELDS, VARIABLE_LOG_FIELDS } from "./contract.ts";

export default log;
