/** The two fields every logged failure carries. `stack` is one string (newlines escaped by JSON), or null. */
export interface SerializedError {
  error: string;
  stack: string | null;
}

/** Flatten anything thrown into `{ error, stack }` so a failure is always one log line with the same keys. */
export function serializeError(thrown: unknown): SerializedError {
  if (thrown instanceof Error) {
    return { error: thrown.message, stack: typeof thrown.stack === "string" ? thrown.stack : null };
  }
  if (typeof thrown === "string") return { error: thrown, stack: null };
  return { error: safeStringify(thrown), stack: null };
}

/**
 * `JSON.stringify` that cannot throw: circular references, BigInts and nested
 * Errors (which stringify to `{}`) are replaced instead of crashing the caller
 * of a log method.
 */
export function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    const text = JSON.stringify(value, (_key, val: unknown) => {
      if (typeof val === "bigint") return val.toString();
      if (val instanceof Error) return { name: val.name, message: val.message, stack: val.stack ?? null };
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    });
    return text ?? String(value);
  } catch {
    return String(value);
  }
}
