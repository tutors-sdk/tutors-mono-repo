import { describe, expect, it } from "vitest";
import { flattenKnipReport } from "../../scripts/checks/knip.ts";

const issue = (file: string, overrides: Record<string, unknown>) => ({
  file,
  owners: [],
  binaries: [],
  dependencies: [],
  devDependencies: [],
  duplicates: [],
  exports: [],
  files: [],
  types: [],
  unlisted: [],
  unresolved: [],
  ...overrides
});

describe("knip report flattening (runway tier A)", () => {
  it("turns every issue kind into a stable baseline line, ignoring plugin noise before the JSON", () => {
    const report = {
      issues: [
        issue("apps/time/src/Old.svelte", { files: [{ name: "apps/time/src/Old.svelte" }] }),
        issue("packages/svelte/community/package.json", { dependencies: [{ name: "@tutors/course", line: 12 }] }),
        issue("packages/svelte/metrics/src/middleware.ts", { unlisted: [{ name: "@sveltejs/kit" }] }),
        issue("tests/contract/support/schemas.ts", {
          exports: [{ name: "WhiteboardUserSchema" }],
          types: [{ name: "LoRecord" }],
          duplicates: [[{ name: "a" }, { name: "b" }]]
        })
      ]
    };
    const stdout = `No Svelte config file found - using defaults.\n${JSON.stringify(report)}`;
    expect(flattenKnipReport(stdout)).toEqual([
      "dependencies: packages/svelte/community/package.json: @tutors/course",
      "duplicate-export: tests/contract/support/schemas.ts: a = b",
      "exports: tests/contract/support/schemas.ts: WhiteboardUserSchema",
      "types: tests/contract/support/schemas.ts: LoRecord",
      "unlisted: packages/svelte/metrics/src/middleware.ts: @sveltejs/kit",
      "unused-file: apps/time/src/Old.svelte"
    ]);
  });

  it("negative fixture: output with no JSON report is an error, not an empty pass", () => {
    expect(() => flattenKnipReport("knip crashed")).toThrow(/no JSON report/);
  });
});
