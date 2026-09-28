import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { checkArchitecture, formatViolation } from "../../scripts/checks/architecture.ts";
import { describeRatchet, ratchet } from "../../scripts/checks/lib/ratchet.ts";
import { REPO_ROOT, readBaseline } from "../../scripts/checks/lib/repo.ts";

const FIXTURE = resolve(__dirname, "fixtures/workspace");
const fixture = (path: string) => resolve(FIXTURE, path);

/** Stand-ins for the workspace package names the fixture files import. */
const FIXTURE_ALIASES = {
  "@tutors/tutors-model-lib": fixture("packages/jsr/model/src/index.ts"),
  "@tutors/logger": fixture("packages/svelte/utils/logger/src/index.ts"),
  "@tutors/runes": fixture("packages/svelte/runes/src/index.ts"),
  "@tutors/themes": fixture("packages/svelte/themes/src/index.ts"),
  "@tutors/connect": fixture("packages/svelte/connect/src/index.ts"),
  "@tutors/rbac": fixture("packages/svelte/utils/rbac/src/index.ts"),
  "@tutors/ui-primitives": fixture("packages/svelte/ui-primitives/src/index.ts"),
  "@tutors/ui-navigators": fixture("packages/svelte/ui-navigators/src/index.ts"),
  "@tutors/ui-components": fixture("packages/svelte/ui-components/src/index.ts"),
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
      ["layer-foundation", "packages/jsr/model/src/reaches-up.ts", "packages/svelte/runes/src/index.ts"],
      ["layer-core", "packages/svelte/course/src/tree.ts", "packages/svelte/themes/src/index.ts"],
      ["layer-feature", "packages/svelte/themes/src/reaches-up.ts", "packages/svelte/ui-primitives/src/index.ts"],
      ["layer-ui-primitives", "packages/svelte/ui-primitives/src/reaches-up.ts", "packages/svelte/ui-navigators/src/index.ts"],
      ["ui-primitives-no-data-features", "packages/svelte/ui-primitives/src/reaches-data.ts", "packages/svelte/utils/rbac/src/index.ts"],
      ["layer-ui-navigators", "packages/svelte/ui-navigators/src/index.ts", "packages/svelte/ui-components/src/index.ts"],
      ["layer-ui-components", "packages/svelte/ui-components/src/reaches-up.ts", "apps/catalogue/src/lib/page.ts"],
      ["no-app-to-app", "apps/reader/src/lib/borrowed.ts", "apps/catalogue/src/lib/page.ts"],
      ["no-cross-workspace-relative-import", "apps/reader/src/lib/borrowed.ts", "apps/catalogue/src/lib/page.ts"],
      ["no-cross-workspace-relative-import", "packages/svelte/community/src/relative.ts", "packages/svelte/runes/src/index.ts"],
      ["no-cross-package-cycle", "packages/svelte/connect/src/index.ts", "packages/svelte/utils/rbac/src/index.ts"]
    ])("%s catches %s -> %s", (rule, from, to) => {
      expect(violations).toContain(`${rule}: ${from} -> ${to}`);
    });

    it("does not flag downward imports or a cycle inside one package", () => {
      const cleanSources = [
        "packages/jsr/model/src/index.ts",
        "packages/svelte/runes/src/index.ts",
        "packages/svelte/themes/src/index.ts",
        "packages/svelte/ui-primitives/src/index.ts",
        "packages/svelte/ui-components/src/tree/Node.ts",
        "packages/svelte/ui-components/src/tree/Children.ts",
        "apps/catalogue/src/lib/page.ts"
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
