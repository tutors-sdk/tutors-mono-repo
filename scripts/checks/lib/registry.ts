import { execFileSync } from "node:child_process";

/**
 * Registry reads for the deploy path: what digest a tag resolves to, and whether
 * that digest was signed by this repository's image build. Both shell out to the
 * tools a CI runner already has (docker buildx, cosign) so nothing is added to
 * the dependency tree; the callers take them as parameters so tests never touch
 * a registry.
 */

/** A registry manifest digest: `sha256:` and 64 lowercase hex characters. */
export const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** The signing identity of image-build.yml, as the release harness checks it. */
export const COSIGN_IDENTITY = "^https://github.com/tutors-sdk/tutors-mono-repo/\\.github/workflows/image-build\\.yml@";
export const COSIGN_ISSUER = "https://token.actions.githubusercontent.com";

export type ResolveDigest = (imageWithTag: string) => string;
/** Returns why the digest is not signed by image-build.yml, or undefined when it is. */
export type VerifySignature = (imageAtDigest: string) => string | undefined;

/** The last line of what a failed tool printed: docker and cosign put the reason there. */
function reason(error: unknown): string {
  const lines = String((error as { stderr?: unknown }).stderr ?? "")
    .trim()
    .split("\n");
  return lines[lines.length - 1] || (error as Error).message.split("\n")[0];
}

/** The digest of the manifest (the index, for a multi-arch image) a tag points at right now. */
export const resolveDigest: ResolveDigest = (imageWithTag) => {
  try {
    return execFileSync("docker", ["buildx", "imagetools", "inspect", imageWithTag, "--format", "{{.Manifest.Digest}}"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    throw new Error(reason(error), { cause: error });
  }
};

/** `cosign verify` by digest, never by tag: a tag can move, a signature is over one digest. */
export const verifySignature: VerifySignature = (imageAtDigest) => {
  try {
    execFileSync("cosign", ["verify", "--certificate-identity-regexp", COSIGN_IDENTITY, "--certificate-oidc-issuer", COSIGN_ISSUER, imageAtDigest], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return undefined;
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? (error as Error).message);
    return stderr.trim().split("\n")[0] || "cosign verify failed";
  }
};
