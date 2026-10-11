/** Verified identity only; course roles, sharing and sentiment belong to their own services. */
export interface Actor {
  /** Provider namespace and its stable account id, for example github:12345. */
  readonly subject: string;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly image: string | null;
}

/** Created for one request; resolves only the session verified by the active adapter. */
export interface SessionPort {
  getActor(): Promise<Actor | null>;
}

export interface IdentityClient {
  signIn(returnTo: string): Promise<void>;
  signOut(returnTo: string): Promise<void>;
}
