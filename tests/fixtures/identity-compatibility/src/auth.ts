import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { authMode } from "./auth-mode";

const DAY = 86400;
const fieldPolicy = process.env.SPIKE_FIELD_POLICY ?? "guarded";
const mode = authMode({ PUBLIC_ANON_MODE: process.env.PUBLIC_ANON_MODE, PRIVATE_AUTH_SECRET: process.env.PRIVATE_AUTH_SECRET });

export const auth =
  mode === "enabled"
    ? betterAuth({
        secret: process.env.PRIVATE_AUTH_SECRET,
        baseURL: "https://tutors.test",
        basePath: "/api/auth",
        socialProviders: {
          github: {
            clientId: "tutors-oauth-app",
            clientSecret: "tutors-oauth-secret",
            mapProfileToUser(profile) {
              const githubId = Number(profile.id);
              if (!Number.isSafeInteger(githubId) || githubId <= 0 || !profile.login) {
                throw new APIError("FORBIDDEN", { message: "Invalid GitHub identity" });
              }
              return { githubId: String(githubId), login: profile.login };
            }
          }
        },
        user: {
          additionalFields: {
            githubId: { type: "string", required: false, input: fieldPolicy !== "server-owned" },
            login: { type: "string", required: false, input: fieldPolicy !== "server-owned" }
          }
        },
        session: {
          expiresIn: 30 * DAY,
          cookieCache: { enabled: true, maxAge: 30 * DAY, strategy: "jwe", refreshCache: true }
        },
        account: { storeStateStrategy: "cookie", storeAccountCookie: true, accountLinking: { enabled: false } },
        hooks: {
          before: createAuthMiddleware(async (ctx) => {
            if (fieldPolicy === "guarded" && ctx.path === "/update-user" && ("githubId" in (ctx.body ?? {}) || "login" in (ctx.body ?? {}))) {
              throw new APIError("FORBIDDEN", { message: "Identity is owned by GitHub" });
            }
          }),
          after: createAuthMiddleware(async (ctx) => {
            // Auth.js renews JWT expiry on each page visit; refreshCache alone does not.
            if (process.env.SPIKE_ROLLING_SESSION !== "1" || ctx.path !== "/get-session" || ctx.query?.disableRefresh || ctx.context.returned == null || !ctx.context.session)
              return;
            const current = ctx.context.session;
            if (current.session.expiresAt.getTime() <= Date.now()) return;
            const renewed = { ...current, session: { ...current.session, expiresAt: new Date(Date.now() + 30 * DAY * 1000) } };
            await setSessionCookie(ctx, renewed);
            return ctx.json(renewed);
          })
        },
        plugins: process.env.SPIKE_FORWARD_COOKIES === "0" ? [] : [sveltekitCookies(getRequestEvent)]
      })
    : null;
