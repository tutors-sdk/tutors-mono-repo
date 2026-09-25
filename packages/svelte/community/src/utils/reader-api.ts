import { env } from "$env/dynamic/public";
import log from "@tutors/logger";

export async function readerApi(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<Response | null> {
  if (env.PUBLIC_ANON_MODE === "TRUE") return null;
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok && response.status !== 401 && response.status !== 503) {
      log.warn("Reader API call failed", { method, path, status: response.status });
    }
    return response;
  } catch (error) {
    log.warn("Reader API unreachable", { method, path, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function readerApiJson<T>(path: string): Promise<T | null> {
  const response = await readerApi("GET", path);
  if (!response?.ok) return null;
  return (await response.json()) as T;
}
