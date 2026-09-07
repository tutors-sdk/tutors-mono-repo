/**
 * Server-only helper for reading the signed-in user's identity from the
 * Auth.js session JWT (issue #155 — snippet sharing).
 *
 * Snippets are stored in Supabase, not on GitHub, so no GitHub access token is
 * requested, persisted, or read here. If you find yourself wanting one, see
 * guides/SNIPPET-SHARING.md first — avoiding a cohort-wide `gist` grant is the
 * reason the feature is shaped the way it is.
 */

import { getToken } from "@auth/core/jwt";
import { PRIVATE_AUTH_SECRET } from "$env/static/private";
import type { RequestEvent } from "@sveltejs/kit";

/** The signed-in user's identity claims. */
export interface GistUser {
  login: string;
  name: string | null;
  image: string | null;
}

/** The claims we need from the session JWT (a subset — not the whole token). */
interface SessionClaims {
  login?: string;
  name?: string | null;
  picture?: string | null;
}

function cookieName(secure: boolean): string {
  return `${secure ? "__Secure-" : ""}authjs.session-token`;
}

/**
 * Read the signed-in user server-side. Returns `null` when there is no
 * signed-in user.
 */
export async function getSessionIdentity(event: RequestEvent): Promise<GistUser | null> {
  const secure = event.url.protocol === "https:";
  // Headers only, never the `Request` itself. `getToken` reads nothing but the
  // cookie/authorization headers, and callers read the JSON body before asking
  // who the caller is — at which point `request.clone()` throws
  // `TypeError: unusable`, turning every share into a 500.
  const payload = (await getToken({
    req: { headers: event.request.headers },
    secret: PRIVATE_AUTH_SECRET,
    secureCookie: secure,
    cookieName: cookieName(secure)
  })) as SessionClaims | null;

  if (!payload?.login) return null;
  return { login: payload.login, name: payload.name ?? null, image: payload.picture ?? null };
}
