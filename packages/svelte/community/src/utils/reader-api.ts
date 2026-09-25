import { env } from "$env/dynamic/public";
import log from "@tutors/logger";

/**
 * The browser's way to the reader's own /api routes, which save and read a student's data on the
 * server with the Auth.js session (apps/reader/src/routes/api, guides/SERVER-WRITES.md). The anon
 * Supabase key never writes student data: these routes are the only path.
 *
 * Returns null without calling anything in anonymous mode. A failed call is logged and returns the
 * response (or null when the network failed), so analytics can stay fire-and-forget.
 */
export async function readerApi(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<Response | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE") return null;
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    // 401 is expected for a visitor who is not signed in, 503 on a server without the service key.
    if (!response.ok && response.status !== 401 && response.status !== 503) {
      log.warn("Reader API call failed", { method, path, status: response.status });
    }
    return response;
  } catch (error) {
    log.warn("Reader API unreachable", { method, path, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/** The JSON body of a successful GET, or null. */
export async function readerApiJson<T>(path: string): Promise<T | null> {
  const response = await readerApi("GET", path);
  if (!response?.ok) return null;
  return (await response.json()) as T;
}
