import type { Handle } from "@sveltejs/kit";
import { SvelteKitAuth } from "@auth/sveltekit";
import GitHub from "@auth/core/providers/github";
import type { SessionPort } from "@tutors/identity";
import log from "@tutors/logger";

declare module "@auth/core/types" {
  interface User {
    login?: string;
    subject?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    login?: string;
    githubId?: string;
  }
}

interface IdentityOptions {
  enabled: () => boolean;
  secret?: string;
  githubId?: string;
  githubSecret?: string;
}

export function createIdentityHandle(options: IdentityOptions): Handle {
  const { handle } = SvelteKitAuth({
    basePath: "/auth",
    providers: [
      GitHub({
        clientId: options.githubId,
        clientSecret: options.githubSecret,
        profile(profile) {
          if (!Number.isSafeInteger(profile.id) || profile.id <= 0 || typeof profile.login !== "string" || !profile.login) {
            throw new Error("GitHub returned an invalid account identity");
          }
          return { id: String(profile.id), login: profile.login, name: profile.name, email: profile.email, image: profile.avatar_url };
        }
      })
    ],
    callbacks: {
      async session({ session, token }) {
        // Old JWTs have only Auth.js's UUID; do not pretend their login proves a GitHub id.
        if (token.githubId !== undefined) {
          session.user.subject = typeof token.githubId === "string" && /^[1-9]\d*$/.test(token.githubId) ? `github:${token.githubId}` : undefined;
        } else {
          session.user.subject = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token.sub ?? "") ? `authjs:${token.sub}` : undefined;
        }
        session.user.login = token.login;
        return session;
      },
      async jwt({ token, user, account }) {
        if (user) token.login = user.login;
        // Only the verified OAuth account supplies this claim; session updates cannot replace it.
        if (account?.provider === "github") token.githubId = account.providerAccountId;
        return token;
      }
    },
    session: { maxAge: 60 * 60 * 24 * 30, strategy: "jwt" },
    secret: options.secret,
    trustHost: true,
    logger: {
      error: (error) => log.error("Auth.js error", error),
      // SvelteKit owns the origin check; Auth.js emits this warning on every auth request.
      warn: (code) => (code === "csrf-disabled" ? log.debug("Auth.js warning", { code }) : log.warn("Auth.js warning", { code })),
      debug: (message, metadata) => log.debug("Auth.js debug", { details: message, metadata })
    }
  });

  return async ({ event, resolve }) => {
    event.locals.actor = null;
    if (!options.enabled()) return resolve(event);
    return handle({
      event,
      resolve: async (event, resolveOptions) => {
        const session: SessionPort = {
          async getActor() {
            // Auth.js forwards renewed cookies through event.cookies as it verifies this request.
            const user = (await event.locals.auth())?.user;
            if (!user?.subject || typeof user.login !== "string" || !user.login) return null;
            return { subject: user.subject, login: user.login, name: user.name ?? null, email: user.email ?? null, image: user.image ?? null };
          }
        };
        event.locals.actor = await session.getActor();
        return resolve(event, resolveOptions);
      }
    });
  };
}
