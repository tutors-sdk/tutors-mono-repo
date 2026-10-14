import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { checkArchitecture, formatViolation } from "../../scripts/checks/architecture.ts";
import { describeRatchet, ratchet } from "../../scripts/checks/lib/ratchet.ts";
import { REPO_ROOT, readBaseline } from "../../scripts/checks/lib/repo.ts";

const FIXTURE = resolve(__dirname, "fixtures/workspace");
const fixture = (path: string) => resolve(FIXTURE, path);

/** Stand-ins for the workspace package names the fixture files import. */
const FIXTURE_ALIASES = {
  "@tutors/tutors-model-lib": fixture("packages/jsr/model/src/index.ts"),
  "@tutors/logger": fixture("packages/platform/logger/src/index.ts"),
  "@tutors/svelte-state": fixture("packages/adapters/driving/svelte-state/src/index.ts"),
  "@tutors/themes": fixture("packages/adapters/driving/themes/src/index.ts"),
  "@tutors/svelte-state/connect": fixture("packages/adapters/driving/svelte-state/src/connect/index.ts"),
  "better-auth": fixture("external/better-auth/index.ts"),
  "@sveltejs/kit": fixture("external/sveltekit.ts"),
  "@supabase/supabase-js": fixture("external/supabase.ts"),
  "$app/env/private": fixture("external/$app/env/private.ts"),
  "$env/dynamic/private": fixture("external/$env/dynamic/private.ts"),
  "@tutors/identity-better-auth/server": fixture("packages/adapters/driven/identity-better-auth/src/index.server.ts"),
  "@tutors/svelte-state/rbac": fixture("packages/adapters/driving/svelte-state/src/rbac/index.ts"),
  "@tutors/ui-primitives": fixture("packages/adapters/driving/ui-primitives/src/index.ts"),
  "@tutors/ui-navigators": fixture("packages/adapters/driving/ui-navigators/src/index.ts"),
  "@tutors/ui-components": fixture("packages/adapters/driving/ui-components/src/index.ts"),
  "tutors-catalogue": fixture("apps/catalogue/src/lib/page.ts")
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
      ["identity-provider-only-in-adapter", "apps/reader/src/lib/provider.ts", "external/better-auth/index.ts"],
      ["identity-provider-only-in-adapter", "packages/adapters/driving/svelte-state/src/connect/provider.ts", "external/better-auth/index.ts"],
      ["identity-contracts-self-contained", "packages/jsr/identity/src/framework.ts", "external/sveltekit.ts"],
      ["identity-contracts-self-contained", "packages/jsr/identity/src/database.ts", "external/supabase.ts"],
      ["identity-no-server-in-browser", "apps/reader/src/lib/leak.client.ts", "packages/adapters/driven/identity-better-auth/src/index.server.ts"],
      ["identity-no-server-in-browser", "apps/reader/src/lib/Leak.svelte", "packages/adapters/driven/identity-better-auth/src/index.server.ts"],
      ["identity-no-server-in-browser", "apps/reader/src/lib/secret.client.ts", "external/$env/dynamic/private.ts"],
      ["identity-no-server-in-browser", "apps/reader/src/lib/kit3-env.client.ts", "external/$app/env/private.ts"],
      ["identity-no-server-in-browser", "packages/adapters/driven/identity-better-auth/src/better-auth.client.ts", "external/better-auth/index.ts"],
      ["layer-foundation", "packages/jsr/model/src/reaches-up.ts", "packages/adapters/driving/svelte-state/src/index.ts"],
      ["layer-core", "packages/adapters/driving/svelte-state/src/tree.ts", "packages/adapters/driving/themes/src/index.ts"],
      ["layer-feature", "packages/adapters/driving/themes/src/reaches-up.ts", "packages/adapters/driving/ui-primitives/src/index.ts"],
      ["layer-ui-primitives", "packages/adapters/driving/ui-primitives/src/reaches-up.ts", "packages/adapters/driving/ui-navigators/src/index.ts"],
      ["ui-primitives-no-data-features", "packages/adapters/driving/ui-primitives/src/reaches-data.ts", "packages/adapters/driving/svelte-state/src/rbac/index.ts"],
      ["tutors-types-self-contained", "packages/jsr/types/src/reaches-out.ts", "packages/jsr/model/src/index.ts"],
      ["layer-ui-navigators", "packages/adapters/driving/ui-navigators/src/index.ts", "packages/adapters/driving/ui-components/src/index.ts"],
      ["layer-ui-components", "packages/adapters/driving/ui-components/src/reaches-up.ts", "apps/catalogue/src/lib/page.ts"],
      ["no-app-to-app", "apps/reader/src/lib/borrowed.ts", "apps/catalogue/src/lib/page.ts"],
      ["no-cross-workspace-relative-import", "apps/reader/src/lib/borrowed.ts", "apps/catalogue/src/lib/page.ts"],
      ["no-cross-workspace-relative-import", "packages/adapters/driving/svelte-state/src/community/relative.ts", "packages/adapters/driving/svelte-state/src/index.ts"],
      ["no-cross-package-cycle", "packages/adapters/driving/svelte-state/src/connect/index.ts", "packages/adapters/driving/svelte-state/src/rbac/index.ts"]
    ])("%s catches %s -> %s", (rule, from, to) => {
      expect(violations).toContain(`${rule}: ${from} -> ${to}`);
    });

    it("does not flag downward imports or a cycle inside one package", () => {
      const cleanSources = [
        "packages/jsr/model/src/index.ts",
        "packages/jsr/types/src/index.ts",
        "packages/adapters/driving/svelte-state/src/index.ts",
        "packages/adapters/driving/themes/src/index.ts",
        "packages/adapters/driving/ui-primitives/src/index.ts",
        "packages/adapters/driving/ui-components/src/tree/Node.ts",
        "packages/adapters/driving/ui-components/src/tree/Children.ts",
        "apps/catalogue/src/lib/page.ts",
        "packages/adapters/driven/identity-better-auth/src/index.server.ts"
      ];
      const falsePositives = violations.filter((line) => cleanSources.some((source) => line.includes(`: ${source} -> `)));
      expect(falsePositives).toEqual([]);
    });
  });

  it("the repo adds no violations beyond the baseline, and the baseline has no stale entries", async () => {
    const current = (await checkArchitecture(["apps", "packages"])).map(formatViolation);
    const result = ratchet(current, readBaseline(resolve(REPO_ROOT, BASELINE)));
    expect(result, describeRatchet("dependency-cruiser", BASELINE, result)).toEqual({ added: [], stale: [] });
  }, 120_000);
});

/**
 * dependency-cruiser reads a .svelte file after the Svelte compiler has stripped its type-only
 * imports, so `import type { X } from "@tutors/svelte-state/community"` in a primitive is invisible to the rule
 * above. This reads the source instead, so a type import cannot cross the same line unseen.
 */
describe("ui-primitives import no data or access package, not even a type", () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? sources(join(dir, e.name)) : /\.(svelte|ts)$/.test(e.name) ? [join(dir, e.name)] : []
    );

  it("names no @tutors/community, @tutors/connect or @tutors/rbac import beyond the baseline", () => {
    const baseline = readBaseline(resolve(REPO_ROOT, BASELINE)).filter(line => line.startsWith("ui-primitives-no-data-features:"));
    const found = sources(resolve(REPO_ROOT, "packages/adapters/driving/ui-primitives/src")).flatMap(file =>
      [...readFileSync(file, "utf8").matchAll(/^\s*import\s[^;]*?from\s+"@tutors\/(community|connect|rbac)"/gm)].map(
        m => `${relative(REPO_ROOT, file)} -> @tutors/${m[1]}`
      )
    );
    // A baseline line names the file and the package's directory, so an edge is listed only when both match.
    const packageDir = { community: "packages/adapters/driving/svelte-state/", connect: "packages/adapters/driving/svelte-state/", rbac: "packages/adapters/driving/svelte-state/" };
    const listed = (edge: string) => {
      const [from, to] = edge.split(" -> ") as [string, string];
      const dir = packageDir[to.replace("@tutors/", "") as keyof typeof packageDir];
      return baseline.some(line => line.includes(`: ${from} -> ${dir}`));
    };
    const unlisted = found.filter(edge => !listed(edge));
    expect(unlisted).toEqual([]);
  });
});
