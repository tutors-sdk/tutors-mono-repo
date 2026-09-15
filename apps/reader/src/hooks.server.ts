import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { SvelteKitAuth } from "@auth/sveltekit";
import { PRIVATE_AUTH_GITHUB_SECRET, PRIVATE_AUTH_GITHUB_ID, PRIVATE_AUTH_SECRET } from "$env/static/private";
import GithubProvider from "@auth/core/providers/github";
import { initLocaleFromCookie } from "@tutors/i18n";
import { env } from "$env/dynamic/public";
import { usesSharedHooks } from "@tutors/hooks/mode";
import { securityHeaders, createServerErrorHandler } from "@tutors/hooks/server";
import * as legacy from "./legacy-hooks.server";

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
    maxAge: 60 * 60 * 24 * 30, // 30 days

    strategy: "jwt"
  },

  secret: PRIVATE_AUTH_SECRET,
  trustHost: true
});

const localeHandle: Handle = async ({ event, resolve }) => {
  event.locals.locale = initLocaleFromCookie(event.request.headers.get("cookie") ?? "");
  return resolve(event);
};

// PUBLIC_TUTORS_HOOKS_MODE picks the shared @tutors/hooks implementation or this
// app's original inline hooks. See packages/svelte/utils/hooks/README.md.
const shared = usesSharedHooks(env.PUBLIC_TUTORS_HOOKS_MODE);

export const handle = sequence(localeHandle, shared ? securityHeaders : legacy.securityHeaders, authInitHandle);

export const handleError = shared ? createServerErrorHandler() : legacy.handleError;
