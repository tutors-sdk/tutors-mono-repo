import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, formCsrfMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { IdentityOptions } from "./options.ts";

const SESSION_SECONDS = 30 * 86400;

export function createBetterAuth(options: IdentityOptions, origin: string) {
  return betterAuth({
    secret: options.secret,
    baseURL: origin,
    basePath: "/api/auth",
    // Better Auth otherwise relaxes origin checks under NODE_ENV=test.
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    socialProviders: {
      github: {
        clientId: options.githubId ?? "",
        clientSecret: options.githubSecret ?? "",
        disableDefaultScope: true,
        scope: ["read:user", "user:email"],
        mapProfileToUser(profile) {
          const githubId = String(profile.id);
          if (!/^[1-9]\d*$/.test(githubId) || !Number.isSafeInteger(Number(githubId)) || typeof profile.login !== "string" || !profile.login) {
            throw new APIError("FORBIDDEN", { message: "Invalid GitHub identity" });
          }
          return { githubId, login: profile.login };
        }
      }
    },
    user: {
      additionalFields: {
        // Provider mapping needs input-enabled fields in 1.7.7; the update hook protects them.
        githubId: { type: "string", required: false, input: true },
        login: { type: "string", required: false, input: true }
      }
    },
    session: {
      expiresIn: SESSION_SECONDS,
      cookieCache: { enabled: true, maxAge: SESSION_SECONDS, strategy: "jwe", refreshCache: true }
    },
    account: { storeStateStrategy: "cookie", storeAccountCookie: true, accountLinking: { enabled: false } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // 1.7.7's social endpoint checks origin only once a Cookie header exists.
        if (ctx.path === "/sign-in/social") await formCsrfMiddleware(ctx);
        if (ctx.path === "/update-user" && (Object.hasOwn(ctx.body ?? {}, "githubId") || Object.hasOwn(ctx.body ?? {}, "login"))) {
          throw new APIError("FORBIDDEN", { message: "Identity is owned by GitHub" });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Cache refresh alone retains the original session expiry; Auth.js renews it on each visit.
        if (ctx.path !== "/get-session" || ctx.query?.disableRefresh || ctx.context.returned == null || !ctx.context.session) return;
        const current = ctx.context.session;
        if (current.session.expiresAt.getTime() <= Date.now()) return;
        const renewed = { ...current, session: { ...current.session, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } };
        await setSessionCookie(ctx, renewed);
        return ctx.json(renewed);
      })
    }
  });
}
