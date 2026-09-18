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
} from "./logger.ts";
export { createRequestLogger, logRequestError, requestIdFrom, levelForStatus } from "./request-logger.ts";

export function createLogger(options?: LoggerOptions): Logger {
  return new TutorsLogger(options);
}

const log: Logger = defaultLogger;

export default log;
