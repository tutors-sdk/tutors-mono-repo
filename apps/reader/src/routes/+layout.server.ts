/**
 * Root server load for the reader: passes the signed-in actor (set by the identity hook in
 * hooks.server.ts, null when signed out or when authentication is off) and the cookie locale to every page.
 */
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => {
  const actor = locals.actor;
  return {
    actor,
    loggedIn: actor !== null,
    user: actor ? { login: actor.login, name: actor.name ?? actor.login, email: actor.email ?? "", image: actor.image ?? "" } : undefined,
    locale: locals.locale
  };
};
