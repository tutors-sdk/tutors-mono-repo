/**
 * @tutors/identity is a facade: the verified actor is defined in @tutors/domain/access and the
 * session and sign-in ports in @tutors/application/ports. The names here are unchanged.
 */
export type { Actor } from "@tutors/domain/access";
export type { SessionPort, IdentityClient } from "@tutors/application/ports";
