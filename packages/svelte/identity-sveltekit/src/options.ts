export type IdentityAdapter = "authjs" | "better-auth";

export interface IdentityOptions {
  enabled: () => boolean;
  adapter?: () => string | undefined;
  secret?: string;
  githubId?: string;
  githubSecret?: string;
}
