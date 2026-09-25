import { error, type RequestEvent } from "@sveltejs/kit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./service-client.ts";

/** Who the Auth.js session says is calling. Identity fields come from GitHub via Auth.js, never from the request body. */
export interface SessionUser {
  login: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

type Locals = RequestEvent["locals"];

type Session = { user?: { login?: string | null; name?: string | null; email?: string | null; image?: string | null } | null } | null;

/** The signed-in user, or null for an anonymous visitor. */
export async function sessionUser(locals: Locals): Promise<SessionUser | null> {
  const session = (await locals.auth?.()) as Session;
  const login = session?.user?.login?.trim();
  if (!login) return null;
  return {
    login,
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
    image: session?.user?.image ?? null
  };
}

/** The signed-in user; 401 otherwise. */
export async function requireUser(locals: Locals): Promise<SessionUser> {
  const user = await sessionUser(locals);
  if (!user) error(401, "Sign in to save your progress");
  return user;
}

/** The service_role client; 503 when this deployment has none. */
export function requireDb(): SupabaseClient {
  const db = serviceClient();
  if (!db) error(503, "Saving is not configured on this server");
  return db;
}

/**
 * The JSON body of a write. Only `application/json` is accepted: a cross-site page cannot send
 * that content type without a CORS preflight, which these routes never answer, so a write can only
 * come from the reader's own pages. Bodies over `maxBytes` are refused before they are parsed.
 */
export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) error(415, "Expected application/json");
  const text = await request.text();
  if (text.length > maxBytes) error(413, "Request body too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    error(400, "Malformed JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) error(400, "Expected a JSON object");
  return body as Record<string, unknown>;
}

/** Throws 400 with `message` unless `value` passed its check. */
export function valid<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) error(400, message);
  return value;
}

/** The empty success answer of a write. */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}
