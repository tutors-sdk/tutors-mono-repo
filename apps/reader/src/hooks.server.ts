import type { Handle, HandleServerError } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { SvelteKitAuth } from "@auth/sveltekit";
import { PRIVATE_AUTH_GITHUB_SECRET, PRIVATE_AUTH_GITHUB_ID, PRIVATE_AUTH_SECRET } from "$env/static/private";
import GithubProvider from "@auth/core/providers/github";
import { initLocaleFromCookie } from "@tutors/i18n";
import log, { setServiceName } from "@tutors/logger";

setServiceName("tutors-reader");

log.info("Service starting", { service: "tutors-reader" });

const { handle: authInitHandle } = SvelteKitAuth({
  basePath: "/auth",
  providers: [
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    GithubProvider({
      clientId: PRIVATE_AUTH_GITHUB_ID,
      clientSecret: PRIVATE_AUTH_GITHUB_SECRET,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      profile(profile: any) {
        return {
          id: profile.id.toString(),
          name: profile.name,
          login: profile.login,
          email: profile.email,
          image: profile.avatar_url
        };
      }
    })
  ],

  callbacks: {
    async session({ session, token }) {
      session.user.login = token.login;
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.login = user.login;
      }
      return token;
    }
  },

  session: {
    maxAge: 60 * 60 * 24 * 365, // 1 year

    strategy: "jwt"
  },

  secret: PRIVATE_AUTH_SECRET,
  trustHost: true
});

const requestLogger: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith("/healthz")) {
    return resolve(event);
  }

  const requestId = event.request.headers.get("x-request-id") || crypto.randomUUID();
  const start = performance.now();

  const response = await resolve(event);

  const duration = performance.now() - start;

  log.info("request completed", {
    requestId,
    method: event.request.method,
    path: event.url.pathname,
    status: response.status,
    duration_ms: Math.round(duration)
  });

  response.headers.set("x-request-id", requestId);
  return response;
};

const localeHandle: Handle = async ({ event, resolve }) => {
  event.locals.locale = initLocaleFromCookie(event.request.headers.get("cookie") ?? "");
  return resolve(event);
};

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export const handle = sequence(requestLogger, localeHandle, securityHeaders, authInitHandle);

export const handleError: HandleServerError = ({ error }) => {
  log.error("Unhandled server error", error instanceof Error ? error : new Error(String(error)));
  return {
    message: "An unexpected error occurred"
  };
};
