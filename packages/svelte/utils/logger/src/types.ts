export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  level?: LogLevel;
  context?: Record<string, unknown>;
  output?: (entry: LogEntry) => void;
}

export type Transport = (entry: LogEntry) => void;

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  debug(...args: unknown[]): void;
  info(message: string, context?: Record<string, unknown>): void;
  info(...args: unknown[]): void;
  warn(message: string, context?: Record<string, unknown>): void;
  warn(...args: unknown[]): void;
  error(message: string, context?: Record<string, unknown>): void;
  error(...args: unknown[]): void;
  child(context: Record<string, unknown>): Logger;
}
