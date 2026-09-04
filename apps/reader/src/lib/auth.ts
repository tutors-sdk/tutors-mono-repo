/**
 * Server-only helper for reading the user's GitHub access token from the
 * Auth.js session JWT (issue #155 — gist sharing).
 *
 * IMPORTANT: this decodes the encrypted session cookie directly to expose the
 * `access_token` claim. The token must NEVER be returned to the client (e.g.
 * via `locals.auth()` / the `session` callback) — it is only used here,
 * server-side, to call the GitHub API. Do not import from a client component.
 */

import { getToken } from "@auth/core/jwt";
import { PRIVATE_AUTH_SECRET } from "$env/static/private";
import type { RequestEvent } from "@sveltejs/kit";

/** The signed-in user's non-secret identity claims (safe to use server-side). */
export interface GistUser {
  login: string;
  name: string | null;
  image: string | null;
}

export interface SessionIdentity {
  user: GistUser;
  /**
   * The user's GitHub OAuth access token, or `null` when it is not present on
   * the session (e.g. the user signed in before the `gist` scope existed and
   * has not re-logged in yet).
   */
  accessToken: string | null;
}

/** The claims we need from the session JWT (a subset — not the whole token). */
interface SessionClaims {
  login?: string;
  name?: string | null;
  picture?: string | null;
  access_token?: string | null;
}

function cookieName(secure: boolean): string {
  return `${secure ? "__Secure-" : ""}authjs.session-token`;
}

/**
 * Read the signed-in user and their GitHub access token, server-side, in a
 * single decode of the session cookie. Returns `null` when there is no
 * signed-in user.
 */
export async function getSessionIdentity(event: RequestEvent): Promise<SessionIdentity | null> {
  const secure = event.url.protocol === "https:";
  const payload = (await getToken({
    req: await event.request.clone(),
    secret: PRIVATE_AUTH_SECRET,
    secureCookie: secure,
    cookieName: cookieName(secure)
  })) as SessionClaims | null;

  if (!payload?.login) return null;
  return {
    user: { login: payload.login, name: payload.name ?? null, image: payload.picture ?? null },
    accessToken: payload.access_token ?? null
  };
}
