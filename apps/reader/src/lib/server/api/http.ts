import { error, type RequestEvent } from "@sveltejs/kit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./service-client.ts";

export interface SessionUser {
  login: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

type Locals = RequestEvent["locals"];

type Session = { user?: { login?: string | null; name?: string | null; email?: string | null; image?: string | null } | null } | null;

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

export async function requireUser(locals: Locals): Promise<SessionUser> {
  const user = await sessionUser(locals);
  if (!user) error(401, "Sign in to save your progress");
  return user;
}

export function requireDb(): SupabaseClient {
  const db = serviceClient();
  if (!db) error(503, "Saving is not configured on this server");
  return db;
}

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

export function valid<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) error(400, message);
  return value;
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}
