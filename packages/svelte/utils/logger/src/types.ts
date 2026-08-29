export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service?: string;
  environment?: string;
  hostname?: string;
  pid?: number;
  requestId?: string;
  error?: { name: string; message: string; stack?: string } | Record<string, unknown>;
  [key: string]: unknown;
}
