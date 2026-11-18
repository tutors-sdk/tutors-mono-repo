/**
 * What the root layout hands every page about who is signed in: the actor the identity hook set on
 * locals (null when signed out or when authentication is off), shaped for the page. Served by
 * GET /api/actor and read by the universal root load (+layout.ts).
 */
import type { Actor } from "@tutors/identity";

export interface ActorData {
  actor: Actor | null;
  loggedIn: boolean;
  user: { login: string; name: string; email: string; image: string } | undefined;
}

export function actorData(actor: Actor | null): ActorData {
  return {
    actor,
    loggedIn: actor !== null,
    user: actor ? { login: actor.login, name: actor.name ?? actor.login, email: actor.email ?? "", image: actor.image ?? "" } : undefined
  };
}
