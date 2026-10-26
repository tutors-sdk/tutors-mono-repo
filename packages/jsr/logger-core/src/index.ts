import { defaultLogger, TutorsLogger } from "./logger.ts";
import type { Logger, LoggerOptions } from "./types.ts";

export type { LogEntry, Logger, LoggerOptions, LogLevel, RuntimeOptions, Transport } from "./types.ts";
export {
  addTransport,
  clearGlobalContext,
  CORE_LOG_KEYS,
  DEFAULT_LOG_EVENT,
  defaultLogger,
  getGlobalContext,
  isLogLevel,
  LOG_LEVELS,
  logServiceStart,
  removeTransport,
  resolveLogLevel,
  runtimeContext,
  setAppName,
  setGlobalContext,
  setRawConsole,
  TutorsLogger,
  useCliOutput,
} from "./logger.ts";
export { formatCli, formatJson, formatPretty } from "./formatter.ts";
export { currentRequestId, type RequestContext, runWithRequestContext } from "./context.ts";
export { safeStringify, type SerializedError, serializeError } from "./errors.ts";

export function createLogger(options?: LoggerOptions): Logger {
  return new TutorsLogger(options);
}

const log: Logger = defaultLogger;

export default log;
