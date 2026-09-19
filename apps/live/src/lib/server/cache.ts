/**
 * A tiny time-to-live memo in front of the read endpoints.
 *
 * The dashboard is public and every viewer asks the same few questions, so one
 * slow aggregate should be paid for once per window rather than once per
 * viewer. Concurrent callers share the in-flight promise, which is what stops a
 * cold cache turning a burst of viewers into a burst of queries.
 */

/** How long each endpoint's answer stays fresh. */
export const CACHE_TTL_MS = {
  /** Presence moves constantly; the SSE stream is the live path. */
  now: 2_000,
  stats: 30_000,
  heatmap: 5 * 60_000,
  observations: 5 * 60_000
} as const;

interface Entry {
  expires: number;
  value: Promise<unknown>;
}

const entries = new Map<string, Entry>();

/** Returns the cached answer for `key`, computing it when there is none or it has expired. */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>, now: number = Date.now()): Promise<T> {
  const entry = entries.get(key);
  if (entry && entry.expires > now) return entry.value as Promise<T>;

  const value = compute().catch((error: unknown) => {
    // A failure must not be served for the rest of the window.
    entries.delete(key);
    throw error;
  });
  entries.set(key, { expires: now + ttlMs, value });
  return value as Promise<T>;
}

/** The `Cache-Control` a response with this TTL should carry. */
export function cacheHeaders(ttlMs: number): Record<string, string> {
  return { "cache-control": `public, max-age=${Math.round(ttlMs / 1000)}` };
}
