/* global APP_VERSION */
import type { Handle, HandleServerError, ServerInit } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { SvelteKitAuth } from "@auth/sveltekit";
import { env } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import GithubProvider from "@auth/core/providers/github";
import { initLocaleFromCookie } from "@tutors/i18n";
import log, { createRequestLogger, logRequestError, logServiceStart, setAppName } from "@tutors/logger";
import { metricsHandle } from "@tutors/metrics";
import { authMode } from "$lib/server/auth-mode";

setAppName("tutors-reader");

const currentAuthMode = () =>
  authMode({ PUBLIC_ANON_MODE: publicEnv.PUBLIC_ANON_MODE, PRIVATE_AUTH_SECRET: env.PRIVATE_AUTH_SECRET });

export const init: ServerInit = async () => {
  const mode = currentAuthMode();
  logServiceStart({ version: APP_VERSION, authMode: mode });
  if (mode === "unconfigured") {
    log.error("Authentication disabled: PRIVATE_AUTH_SECRET is not set. Set it, or set PUBLIC_ANON_MODE=TRUE.");
  }
};

const { handle: authInitHandle } = SvelteKitAuth({
  basePath: "/auth",
  providers: [
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    GithubProvider({
      clientId: env.PRIVATE_AUTH_GITHUB_ID,
      clientSecret: env.PRIVATE_AUTH_GITHUB_SECRET,
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
    maxAge: 60 * 60 * 24 * 30, // 30 days

    strategy: "jwt"
  },

  secret: env.PRIVATE_AUTH_SECRET,
  trustHost: true,

  // Route Auth.js output through the structured logger; its default writes
  // coloured plain text that log collectors cannot parse.
  logger: {
    error: (error) => log.error("Auth.js error", error),
    // @auth/sveltekit turns off Auth.js's own CSRF token and relies on
    // SvelteKit's origin check, so "csrf-disabled" arrives on every auth request.
    warn: (code) => (code === "csrf-disabled" ? log.debug("Auth.js warning", { code }) : log.warn("Auth.js warning", { code })),
    debug: (message, metadata) => log.debug(`Auth.js: ${message}`, { metadata })
  }
});

// First in the chain so every request gets a correlation id and one completion line,
// including requests that fail inside the hooks below.
const requestLogger = createRequestLogger();

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

// Without a secret Auth.js throws MissingSecret from the root layout on every
// page, so anonymous and unconfigured deployments skip it and have no session.
const authHandle: Handle = async (input) => {
  if (currentAuthMode() === "enabled") return authInitHandle(input);
  input.event.locals.auth = async () => null;
  return input.resolve(input.event);
};

export const handle = sequence(requestLogger, metricsHandle, localeHandle, securityHeaders, authHandle);

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  logRequestError({ error, event, status, message });
  return {
    message: "An unexpected error occurred"
  };
};
