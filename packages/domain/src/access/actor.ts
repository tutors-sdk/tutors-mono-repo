/** Verified identity only; course roles, sharing and sentiment belong to their own contexts. */
export interface Actor {
  /** Provider namespace and its stable account id, for example github:12345. */
  readonly subject: string;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly image: string | null;
}
