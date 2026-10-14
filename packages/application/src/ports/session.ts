import type { Actor } from "@tutors/domain/access";

/** Created for one request; resolves only the session verified by the active adapter. */
export interface SessionPort {
  getActor(): Promise<Actor | null>;
}

/** The browser side of signing in and out. */
export interface IdentityClient {
  signIn(returnTo: string): Promise<void>;
  signOut(returnTo: string): Promise<void>;
}
