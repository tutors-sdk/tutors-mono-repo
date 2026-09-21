import { clockStatus } from "./clock.ts";

type Env = Record<string, string | undefined>;

export interface VersionInfo {
  /** Service name, e.g. `tutors-reader`. */
  app: string;
  /** Release version (the app's package.json version, fixed at build time). */
  version: string;
  /** Git commit the image was built from (`GIT_SHA` build arg), or `unknown`. */
  revision: string;
  /** When the image was built (`BUILD_DATE` build arg), or `unknown`. */
  built: string;
  /** `frozen` only while the release harness has set `HARNESS_NOW`. */
  clock: "system" | "frozen";
}

export interface VersionOptions {
  app: string;
  version: string;
  /** Environment to read `GIT_SHA` and `BUILD_DATE` from. Defaults to `process.env`. */
  env?: Env;
}

function serverEnv(): Env {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

export function versionInfo(options: VersionOptions): VersionInfo {
  const env = options.env ?? serverEnv();
  return {
    app: options.app,
    version: options.version,
    revision: env.GIT_SHA?.trim() || "unknown",
    built: env.BUILD_DATE?.trim() || "unknown",
    clock: clockStatus(env).mode
  };
}

/**
 * `GET /version`: the one route that answers build identity. Everything that
 * differs between two builds of the same source (commit, build date) is
 * confined here, so a release comparison masks exactly one route.
 */
export function versionEndpoint(options: VersionOptions): Response {
  return new Response(JSON.stringify(versionInfo(options)), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
