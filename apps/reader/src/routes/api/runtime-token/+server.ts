import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { dev } from "$app/environment";
import type { RequestHandler } from "./$types";

/**
 * Exchange a signed-in Tutors session for a short-lived Supabase token.
 *
 * Everything Tutors stores today is written with the anon key under policies that allow
 * anything, which is fine for a page count and not fine for a student's own work. A
 * playground snapshot has an owner, so it needs a request Postgres can attribute: this
 * mints a JWT whose `sub` is the GitHub login the reader already authenticated, signed
 * with the project's JWT secret so Supabase accepts it as an authenticated user.
 *
 * The educator claim is decided here rather than sent by the client. The course's own
 * `enrollment.yaml`, published in its `tutors.json`, is the authority on who teaches it,
 * and it is read server-side — a browser asking to be treated as an educator is ignored.
 *
 * Signed with SubtleCrypto rather than a JWT library: an HS256 token is two base64url
 * segments and an HMAC, and the reader has no other need for the dependency.
 */

const TOKEN_LIFETIME_SECONDS = 60 * 60;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeSegment(value: object): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function sign(payload: object, secret: string): Promise<string> {
  const body = `${encodeSegment({ alg: "HS256", typ: "JWT" })}.${encodeSegment(payload)}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${base64Url(new Uint8Array(signature))}`;
}

/** Whether this login teaches this course, according to the course itself. */
async function teaches(courseId: string, login: string, fetcher: typeof fetch): Promise<boolean> {
  // Mirrors the reader's own course-url rule: a private address is a local course served
  // over http, and only in development is one reachable at all.
  const isPrivate = /^(localhost|127\.|10\.|192\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(courseId);
  if (isPrivate && !dev) return false;

  try {
    const response = await fetcher(`${isPrivate ? "http" : "https"}://${courseId}/tutors.json`);
    if (!response.ok) return false;
    const course = (await response.json()) as { enrollment?: { educators?: string[] } };
    return course.enrollment?.educators?.includes(login) ?? false;
  } catch {
    // An unreachable course is not an educator's course. The student claims still work.
    return false;
  }
}

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
  const secret = env.PRIVATE_SUPABASE_JWT_SECRET;
  // Not configured is a normal deployment, not a fault: the reader runs perfectly well
  // without any of this, and the playground simply keeps the student's work local.
  if (!secret) return json({ error: "not-configured" }, { status: 501 });

  const session = await locals.auth();
  const login = (session?.user as { login?: string } | undefined)?.login;
  if (!login) return json({ error: "not-signed-in" }, { status: 401 });

  const courseId = url.searchParams.get("courseId") ?? "";
  if (!courseId || /[/\\@?#]/.test(courseId)) return json({ error: "bad-course" }, { status: 400 });

  const issuedAt = Math.floor(Date.now() / 1000);
  const token = await sign(
    {
      sub: login,
      role: "authenticated",
      aud: "authenticated",
      iss: "tutors-reader",
      name: session?.user?.name ?? login,
      educator_courses: (await teaches(courseId, login, fetch)) ? [courseId] : [],
      iat: issuedAt,
      exp: issuedAt + TOKEN_LIFETIME_SECONDS
    },
    secret
  );

  return json({ token, expiresIn: TOKEN_LIFETIME_SECONDS }, { headers: { "cache-control": "no-store" } });
};
