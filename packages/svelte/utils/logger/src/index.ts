import { TutorsLogger } from "./logger.ts";
import type { LoggerOptions, Logger } from "./types.ts";

export type { LogLevel, LogEntry, LoggerOptions, Logger } from "./types.ts";

export function createLogger(options?: LoggerOptions): Logger {
  return new TutorsLogger(options);
}

const log: Logger = createLogger();

export default log;
