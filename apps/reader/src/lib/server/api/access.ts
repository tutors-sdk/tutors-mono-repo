import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { Permission } from "@tutors/rbac/types";
import { AuthorizationUnavailableError, createAuthorization, listFromEnv, type Actor, type Authorization, type Resource } from "./authorization.ts";

let instance: Authorization | undefined;

/** The reader's one authorization module, configured from the private environment. */
export function authorization(): Authorization {
  instance ??= createAuthorization({
    fetch,
    allowedHosts: listFromEnv(env.PRIVATE_COURSE_HOSTS),
    admins: listFromEnv(env.PRIVATE_TUTORS_ADMINS)
  });
  return instance;
}

/** can(), for a route: 503 when the course's educators cannot be read (Rule 0073) rather than a silent no. */
export async function authorize(actor: Actor | null, action: Permission, resource: Resource): Promise<boolean> {
  try {
    return await authorization().can(actor, action, resource);
  } catch (e) {
    if (e instanceof AuthorizationUnavailableError) error(503, "Could not read who teaches this course from its host; try again shortly");
    throw e;
  }
}

/** Origins (the time and live apps) allowed to read /api/time with the reader's session cookie. */
export function allowedOrigins(): string[] {
  return listFromEnv(env.PRIVATE_API_ALLOWED_ORIGINS);
}
