import log from "loglevel";
import type { LogEntry } from "./types.ts";

export type { LogEntry };

const isDev = import.meta.env.DEV;

let envLogLevel: string | undefined;
let hostname: string | undefined;
let pid: number | undefined;

try {
  if (typeof process !== "undefined") {
    envLogLevel = process.env?.LOG_LEVEL;
    pid = process.pid;
    hostname = process.env?.HOSTNAME;
  }
} catch {
  // Browser environment — process is unavailable
}

const level = envLogLevel || (isDev ? "debug" : "info");

let serviceName = "tutors";

export function setServiceName(name: string) {
  serviceName = name;
}

function serializeArg(arg: unknown): Record<string, unknown> {
  if (arg instanceof Error) {
    return { error: { name: arg.name, message: arg.message, stack: arg.stack } };
  }
  if (typeof arg === "object" && arg !== null) {
    const obj = arg as Record<string, unknown>;
    if ("message" in obj && ("code" in obj || "details" in obj || "hint" in obj)) {
      return { error: obj };
    }
    return obj;
  }
  if (arg !== undefined) {
    return { detail: arg };
  }
  return {};
}

if (!isDev) {
  log.methodFactory = function (methodName) {
    return function (...args: unknown[]) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: methodName,
        message: "",
        service: serviceName,
        environment: "production"
      };

      if (hostname) entry.hostname = hostname;
      if (pid) entry.pid = pid;

      if (args.length === 0) {
        entry.message = "";
      } else if (args.length === 1) {
        const arg = args[0];
        if (arg instanceof Error) {
          entry.message = arg.message;
          entry.error = { name: arg.name, message: arg.message, stack: arg.stack };
        } else if (typeof arg === "string") {
          entry.message = arg;
        } else {
          entry.message = String(arg);
          if (typeof arg === "object" && arg !== null) {
            entry.data = arg;
          }
        }
      } else {
        entry.message = String(args[0]);
        for (let i = 1; i < args.length; i++) {
          Object.assign(entry, serializeArg(args[i]));
        }
      }

      const json = JSON.stringify(entry);
      if (methodName === "error") {
        console.error(json);
      } else if (methodName === "warn") {
        console.warn(json);
      } else {
        console.log(json);
      }
    };
  };
}

log.setLevel(level as log.LogLevelDesc);

export default log;
