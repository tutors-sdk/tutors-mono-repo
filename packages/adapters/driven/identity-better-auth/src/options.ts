export interface IdentityOptions {
  enabled: () => boolean;
  secret?: string;
  githubId?: string;
  githubSecret?: string;
}
