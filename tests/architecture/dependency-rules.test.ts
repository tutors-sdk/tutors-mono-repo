import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { checkArchitecture, formatViolation, vendorPath } from "../../scripts/checks/architecture.ts";
import { describeRatchet, ratchet } from "../../scripts/checks/lib/ratchet.ts";
import { REPO_ROOT, readBaseline } from "../../scripts/checks/lib/repo.ts";

const FIXTURE = resolve(__dirname, "fixtures/workspace");
const fixture = (path: string) => resolve(FIXTURE, path);

/** Stand-ins for the workspace package names and vendors the fixture files import. */
const FIXTURE_ALIASES = {
  "@tutors/domain": fixture("packages/domain/src/index.ts"),
  "@tutors/application": fixture("packages/application/src/index.ts"),
  "@tutors/tutors-model-lib": fixture("packages/jsr/model/src/index.ts"),
  "@tutors/logger": fixture("packages/platform/logger/src/index.ts"),
  "@tutors/store-supabase": fixture("packages/adapters/driven/store-supabase/src/index.ts"),
  // Exact (`$`): enhanced-resolve would otherwise take this alias for the subpaths below.
  "@tutors/svelte-state$": fixture("packages/adapters/driving/svelte-state/src/index.ts"),
  "@tutors/svelte-state/connect": fixture("packages/adapters/driving/svelte-state/src/connect/index.ts"),
  "@tutors/svelte-state/rbac": fixture("packages/adapters/driving/svelte-state/src/rbac/index.ts"),
  "@tutors/themes": fixture("packages/adapters/driving/themes/src/index.ts"),
  "@tutors/ui-primitives": fixture("packages/adapters/driving/ui-primitives/src/index.ts"),
  "@tutors/ui-navigators": fixture("packages/adapters/driving/ui-navigators/src/index.ts"),
  "@tutors/ui-components": fixture("packages/adapters/driving/ui-components/src/index.ts"),
  "@tutors/identity-better-auth/server": fixture("packages/adapters/driven/identity-better-auth/src/index.server.ts"),
  "tutors-catalogue": fixture("apps/catalogue/src/lib/page.ts"),
  "better-auth": fixture("external/better-auth/index.ts"),
  "@sveltejs/kit": fixture("external/sveltekit.ts"),
  "@supabase/supabase-js": fixture("external/@supabase/supabase-js.ts"),
  "shiki/core": fixture("external/shiki/core.ts"),
  "$app/env/private": fixture("external/$app/env/private.ts"),
  "$env/dynamic/private": fixture("external/$env/dynamic/private.ts")
};

const BASELINE = "tests/architecture/known-violations.txt";

describe("architecture rules (runway tier A)", () => {
  describe("negative fixtures", () => {
    let violations: string[] = [];

    beforeAll(async () => {
      const found = await checkArchitecture(["apps", "packages"], { baseDir: FIXTURE, alias: FIXTURE_ALIASES });
      violations = found.map(formatViolation);
    }, 60_000);

    it.each([
      ["domain-self-contained", "packages/domain/src/reaches-out.ts", "packages/platform/logger/src/index.ts"],
      ["domain-self-contained", "packages/domain/src/reaches-up.ts", "packages/application/src/index.ts"],
      ["application-imports-domain-only", "packages/application/src/reaches-vendor.ts", "external/@supabase/supabase-js.ts"],
      ["application-imports-domain-only", "packages/application/src/reaches-adapter.ts", "packages/adapters/driven/store-supabase/src/index.ts"],
      ["vendor-only-in-its-adapter", "packages/adapters/driven/course-http/src/index.ts", "external/@supabase/supabase-js.ts"],
      ["vendor-only-in-its-adapter", "packages/adapters/driving/svelte-state/src/vendor.ts", "external/shiki/core.ts"],
      ["vendor-only-in-its-adapter", "packages/adapters/driving/svelte-state/src/connect/provider.ts", "external/better-auth/index.ts"],
      ["no-adapter-to-adapter", "packages/adapters/driven/realtime-supabase/src/index.ts", "packages/adapters/driven/store-supabase/src/index.ts"],
      ["svelte-state-imports-no-adapter", "packages/adapters/driving/svelte-state/src/tree.ts", "packages/adapters/driving/themes/src/index.ts"],
      ["adapters-import-no-app", "packages/adapters/driven/identity-better-auth/src/reaches-app.ts", "apps/catalogue/src/lib/page.ts"],
      ["adapters-import-no-app", "packages/adapters/driving/ui-components/src/reaches-up.ts", "apps/catalogue/src/lib/page.ts"],
      ["ui-layering", "packages/adapters/driving/ui-primitives/src/reaches-up.ts", "packages/adapters/driving/ui-navigators/src/index.ts"],
      ["ui-layering", "packages/adapters/driving/ui-navigators/src/index.ts", "packages/adapters/driving/ui-components/src/index.ts"],
      ["ui-layering", "packages/adapters/driving/ui-components/src/reaches-up.ts", "apps/catalogue/src/lib/page.ts"],
      ["ui-layering", "packages/adapters/driving/themes/src/reaches-up.ts", "packages/adapters/driving/ui-primitives/src/index.ts"],
      ["ui-primitives-no-data-features", "packages/adapters/driving/ui-primitives/src/reaches-data.ts", "packages/adapters/driving/svelte-state/src/rbac/index.ts"],
      ["platform-self-contained", "packages/platform/logger/src/reaches-ring.ts", "packages/domain/src/index.ts"],
      ["facades-import-rings-only", "packages/jsr/model/src/reaches-adapter.ts", "packages/adapters/driven/store-supabase/src/index.ts"],
      ["tutors-types-self-contained", "packages/jsr/types/src/reaches-out.ts", "packages/jsr/model/src/index.ts"],
      ["identity-provider-only-in-adapter", "apps/reader/src/lib/provider.ts", "external/better-auth/index.ts"],
      ["identity-contracts-self-contained", "packages/jsr/identity/src/framework.ts", "external/sveltekit.ts"],
      ["identity-contracts-self-contained", "packages/jsr/identity/src/database.ts", "external/@supabase/supabase-js.ts"],
      ["identity-no-server-in-browser", "apps/reader/src/lib/leak.client.ts", "packages/adapters/driven/identity-better-auth/src/index.server.ts"],
      ["identity-no-server-in-browser", "apps/reader/src/lib/Leak.svelte", "packages/adapters/driven/identity-better-auth/src/index.server.ts"],
      ["identity-no-server-in-browser", "apps/reader/src/lib/secret.client.ts", "external/$env/dynamic/private.ts"],
      ["identity-no-server-in-browser", "apps/reader/src/lib/kit3-env.client.ts", "external/$app/env/private.ts"],
      ["identity-no-server-in-browser", "packages/adapters/driven/identity-better-auth/src/better-auth.client.ts", "external/better-auth/index.ts"],
      ["no-app-to-app", "apps/reader/src/lib/borrowed.ts", "apps/catalogue/src/lib/page.ts"],
      ["no-cross-workspace-relative-import", "apps/reader/src/lib/borrowed.ts", "apps/catalogue/src/lib/page.ts"],
      ["no-cross-workspace-relative-import", "packages/adapters/driving/svelte-state/src/community/relative.ts", "packages/domain/src/index.ts"],
      ["no-cross-package-cycle", "packages/adapters/driving/svelte-state/src/connect/index.ts", "packages/adapters/driving/themes/src/index.ts"]
    ])("%s catches %s -> %s", (rule, from, to) => {
      expect(violations).toContain(`${rule}: ${from} -> ${to}`);
    });

    it("does not flag inward imports, a vendor in its own adapter, or a cycle inside one package", () => {
      const cleanSources = [
        "packages/domain/src/index.ts",
        "packages/application/src/index.ts",
        "packages/adapters/driven/store-supabase/src/index.ts",
        "packages/adapters/driven/identity-better-auth/src/index.server.ts",
        "packages/jsr/model/src/index.ts",
        "packages/jsr/types/src/index.ts",
        "packages/platform/logger/src/index.ts",
        "packages/adapters/driving/svelte-state/src/index.ts",
        "packages/adapters/driving/ui-primitives/src/index.ts",
        "packages/adapters/driving/ui-components/src/tree/Node.ts",
        "packages/adapters/driving/ui-components/src/tree/Children.ts",
        "apps/catalogue/src/lib/page.ts"
      ];
      const falsePositives = violations.filter((line) => cleanSources.some((source) => line.includes(`: ${source} -> `)));
      expect(falsePositives).toEqual([]);
    });
  });

  it("names a vendor module by its package path, so a version bump changes no baseline line", () => {
    expect(vendorPath("node_modules/.pnpm/shiki@4.5.0/node_modules/shiki/dist/core.mjs")).toBe("shiki/dist/core.mjs");
    expect(vendorPath("node_modules/.pnpm/@supabase+supabase-js@2.117.2_x@1/node_modules/@supabase/supabase-js/dist/index.d.mts")).toBe("@supabase/supabase-js/dist/index.d.mts");
    expect(vendorPath("packages/domain/src/index.ts")).toBe("packages/domain/src/index.ts");
  });

  it("the repo adds no violations beyond the baseline, and the baseline has no stale entries", async () => {
    const current = (await checkArchitecture(["apps", "packages"])).map(formatViolation);
    const result = ratchet(current, readBaseline(resolve(REPO_ROOT, BASELINE)));
    expect(result, describeRatchet("dependency-cruiser", BASELINE, result)).toEqual({ added: [], stale: [] });
  }, 120_000);
});

const sources = (dir: string, match: RegExp): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === "node_modules" || e.name === "dist" || e.name === ".svelte-kit"
      ? []
      : e.isDirectory()
        ? sources(join(dir, e.name), match)
        : match.test(e.name)
          ? [join(dir, e.name)]
          : []
  );

/**
 * dependency-cruiser reads a .svelte file after the Svelte compiler has stripped its type-only
 * imports, so `import type { X } from "@tutors/svelte-state/community"` in a primitive is invisible to the rule
 * above. This reads the source instead, so a type import cannot cross the same line unseen.
 */
describe("ui-primitives import no data or access package, not even a type", () => {
  it("names no @tutors/community, @tutors/connect or @tutors/rbac import beyond the baseline", () => {
    const baseline = readBaseline(resolve(REPO_ROOT, BASELINE)).filter((line) => line.startsWith("ui-primitives-no-data-features:"));
    const found = sources(resolve(REPO_ROOT, "packages/adapters/driving/ui-primitives/src"), /\.(svelte|ts)$/).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/^\s*import\s[^;]*?from\s+"@tutors\/svelte-state\/(community|connect|rbac)"/gm)].map(
        (m) => `${relative(REPO_ROOT, file)} -> packages/adapters/driving/svelte-state/src/${m[1]}/`
      )
    );
    const unlisted = found.filter((edge) => !baseline.some((line) => line.includes(`: ${edge}`)));
    expect(unlisted).toEqual([]);
  });
});

/**
 * Runes are not imports, so dependency-cruiser cannot see them. Rune state ($state, $derived,
 * $effect in a .ts or .svelte.ts module) has one home, the svelte-state adapter: the rings know
 * no framework, and every other package reads state through it. Components keep their own local
 * runes. The baseline lists the service modules still holding runes of their own.
 */
describe("runes-only-in-svelte-state", () => {
  it("names no rune in a package module outside svelte-state beyond the baseline", () => {
    const baseline = readBaseline(resolve(REPO_ROOT, BASELINE)).filter((line) => line.startsWith("runes-only-in-svelte-state:"));
    const found = sources(resolve(REPO_ROOT, "packages"), /\.ts$/)
      .map((file) => relative(REPO_ROOT, file))
      .filter((file) => !file.startsWith("packages/adapters/driving/svelte-state/") && !/\.(test|spec|d)\.ts$/.test(file) && !file.includes("/test/"))
      .filter((file) => /\$(state|derived|effect)(\.\w+)?\(/.test(readFileSync(resolve(REPO_ROOT, file), "utf8")))
      .map((file) => `runes-only-in-svelte-state: ${file} -> svelte runes`);
    const result = ratchet(found, baseline);
    expect(result, describeRatchet("runes-only-in-svelte-state", BASELINE, result)).toEqual({ added: [], stale: [] });
  });
});
