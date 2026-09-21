import { TutorsLogger, defaultLogger } from "./logger.ts";
import type { LoggerOptions, Logger } from "./types.ts";

export type {
  LogLevel,
  LogEntry,
  LoggerOptions,
  Logger,
  Transport,
  RuntimeOptions,
  RequestLikeEvent,
  RequestLoggerOptions,
  RequestErrorInput,
} from "./types.ts";
export {
  addTransport,
  removeTransport,
  setAppName,
  setGlobalContext,
  getGlobalContext,
  clearGlobalContext,
  resolveLogLevel,
  runtimeContext,
  logServiceStart,
  isLogLevel,
  LOG_LEVELS,
  CORE_LOG_KEYS,
  DEFAULT_LOG_EVENT,
} from "./logger.ts";
export { createRequestLogger, logRequestError, requestIdFrom, levelForStatus, REQUEST_ID_HEADER } from "./request-logger.ts";
export { currentRequestId, runWithRequestContext, type RequestContext } from "./context.ts";
export { serializeError, safeStringify, type SerializedError } from "./errors.ts";
export { installProcessLogging, type ProcessLoggingOptions } from "./process.ts";
export { withRequestId } from "./outbound.ts";
export { LOG_EVENT_FIELDS, VARIABLE_LOG_FIELDS } from "./contract.ts";

export function createLogger(options?: LoggerOptions): Logger {
  return new TutorsLogger(options);
}

const log: Logger = defaultLogger;

export default log;
