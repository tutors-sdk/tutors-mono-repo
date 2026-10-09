import type { Handle } from "@sveltejs/kit";
import { createAuthjsHandle } from "./authjs.server.ts";
import { createBetterAuth } from "./better-auth.server.ts";
import type { IdentityOptions } from "./options.ts";

export function createIdentityHandle(options: IdentityOptions): Handle {
  const authjs = createAuthjsHandle(options);
  const authPaths = new Set(["/sign-in/social", "/callback/github", "/get-session", "/sign-out", "/update-user", "/error"]);
  const handle: Handle = async ({ event, resolve }) => {
    const adapter = options.adapter?.() || "authjs";
    if (adapter !== "authjs" && adapter !== "better-auth") throw new Error("PRIVATE_AUTH_ADAPTER must be authjs or better-auth");
    event.locals.identityAdapter = adapter;
    if (adapter === "authjs") return authjs({ event, resolve });
    event.locals.actor = null;
    if (!options.enabled()) return resolve(event);
    // Keep the SDK's fallback memory adapter from becoming a session store.
    const auth = createBetterAuth(options, event.url.origin);
    if (event.url.pathname.startsWith("/api/auth/")) {
      // Expose only the GitHub flow and guarded profile/session endpoints; no account linking or other providers.
      if (!authPaths.has(event.url.pathname.slice("/api/auth".length))) return new Response("Not Found", { status: 404 });
      return auth.handler(event.request);
    }
    const { response: session, headers } = await auth.api.getSession({ headers: event.request.headers, returnHeaders: true });
    const user = session?.user;
    if (user && /^[1-9]\d*$/.test(user.githubId ?? "") && Number.isSafeInteger(Number(user.githubId)) && typeof user.login === "string" && user.login) {
      event.locals.actor = { subject: `github:${user.githubId}`, login: user.login, name: user.name ?? null, email: user.email ?? null, image: user.image ?? null };
    }
    const response = await resolve(event);
    const forwarded = new Headers(response.headers);
    // getSession refreshes outside the auth route; forward every cookie, including deletion/chunks.
    for (const cookie of headers.getSetCookie()) forwarded.append("set-cookie", cookie);
    if (session || headers.has("set-cookie")) forwarded.set("cache-control", "private, no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: forwarded });
  };
  return async (input) => {
    const response = await handle(input);
    // Hooks that return an SDK response bypass Kit's event.cookies forwarding.
    const retiredPrefix = input.event.locals.identityAdapter === "authjs" ? "better-auth." : "authjs.";
    const retired = input.event.cookies.getAll().filter(({ name }) => name.replace(/^(?:__Secure-|__Host-)/, "").startsWith(retiredPrefix));
    if (!retired.length) return response;
    const copy = new Response(response.body, response);
    for (const { name } of retired) copy.headers.append("set-cookie", input.event.cookies.serialize(name, "", { path: "/", maxAge: 0 }));
    copy.headers.set("cache-control", "private, no-store");
    return copy;
  };
}
