import type { Handle } from "@sveltejs/kit/hooks";
import { building } from "$app/env";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { auth } from "./auth";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.actor = null;
  event.locals.expiresAt = null;
  if (!auth || building) return resolve(event);
  const session = await auth.api.getSession({ headers: event.request.headers });
  if (session?.user.githubId && session.user.login) {
    event.locals.actor = {
      subject: `github:${session.user.githubId}`,
      login: session.user.login,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null
    };
    event.locals.expiresAt = session.session.expiresAt.toISOString();
  }
  return svelteKitHandler({ event, resolve, auth, building });
};
