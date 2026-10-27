import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, readText } from "../../scripts/checks/lib/repo.ts";

/**
 * SvelteKit emits its hashed build output under /_app/immutable/, so that is the
 * path the long-lived immutable Cache-Control belongs on. Until 17.0.0 every app
 * set it on /build/*, which nothing is served from: production on Netlify sent no
 * cache header for its chunks while the images (adapter-node) did, and post-deploy
 * read 24 cache-control differences.
 */
const APPS = ["catalogue", "live", "reader", "time"] as const;

describe("Netlify caches SvelteKit's hashed assets", () => {
  it.each(APPS)("%s sets immutable Cache-Control on /_app/immutable/*", (app) => {
    const toml = readText(join(REPO_ROOT, "apps", app, "netlify.toml"));
    const blocks = toml.split("[[headers]]").slice(1);
    const immutable = blocks.filter((b) => /Cache-Control\s*=\s*"public, max-age=31536000, immutable"/.test(b));
    expect(immutable).toHaveLength(1);
    expect(immutable[0]).toMatch(/for\s*=\s*"\/_app\/immutable\/\*"/);
  });
});
