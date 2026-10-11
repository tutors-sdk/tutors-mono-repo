import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => {
  const actor = locals.actor;
  return {
    actor,
    identityAdapter: locals.identityAdapter,
    loggedIn: actor !== null,
    user: actor ? { login: actor.login, name: actor.name ?? actor.login, email: actor.email ?? "", image: actor.image ?? "" } : undefined,
    locale: locals.locale
  };
};
