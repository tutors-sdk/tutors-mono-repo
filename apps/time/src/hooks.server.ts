import type { Handle, HandleServerError } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { SvelteKitAuth } from "@auth/sveltekit";
import GithubProvider from "@auth/core/providers/github";
import { PRIVATE_AUTH_GITHUB_SECRET, PRIVATE_AUTH_GITHUB_ID, PRIVATE_AUTH_SECRET } from "$env/static/private";
import log from "@tutors/logger";

/**
 * GitHub sign-in for the lecturer dashboard (issue #155).
 *
 * The dashboard shows student-authored snippets, so it needs to know *who*
 * is asking before it will hand any over. Authorisation itself lives in
 * `$lib/server/educator.ts` — this only establishes identity.
 *
 * Scope is the minimum needed to read a GitHub login. The dashboard never
 * acts on the user's behalf on GitHub, so it asks for nothing beyond that.
 *
 * NOTE: a GitHub OAuth App permits a single callback URL, so this app needs
 * its own OAuth App (callback `<origin>/auth/callback/github`) distinct from
 * the reader's.
 */
const { handle: authInitHandle } = SvelteKitAuth({
  basePath: "/auth",
  providers: [
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    GithubProvider({
      clientId: PRIVATE_AUTH_GITHUB_ID,
      clientSecret: PRIVATE_AUTH_GITHUB_SECRET,
      authorization: { params: { scope: "read:user user:email" } },
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

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
};

export const handle = sequence(securityHeaders, authInitHandle);

export const handleError: HandleServerError = ({ error }) => {
  log.error("Server error:", error instanceof Error ? error : { details: error });
  return {
    message: "An unexpected error occurred"
  };
};
