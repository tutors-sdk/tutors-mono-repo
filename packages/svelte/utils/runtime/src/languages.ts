/** Small mappings the editor and the run-time both need, kept in one place. */

import type { RuntimeId } from "./types.ts";

export function runtimeLabel(runtime: RuntimeId): string {
  return { python: "Python", javascript: "JavaScript", typescript: "TypeScript" }[runtime] ?? runtime;
}

export function runtimeFileExtension(runtime: RuntimeId): string {
  return { python: "py", javascript: "js", typescript: "ts" }[runtime] ?? "txt";
}

/** Which editor grammar a file wants, which is its own extension rather than the kernel's. */
export function languageForPath(path: string, fallback: RuntimeId): "python" | "javascript" | "typescript" | "json" | "text" {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  switch (extension) {
    case "py":
      return "python";
    case "js":
    case "mjs":
      return "javascript";
    case "ts":
      return "typescript";
    case "json":
      return "json";
    case "txt":
    case "csv":
    case "md":
      return "text";
    default:
      return fallback;
  }
}
