import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkJsrWorkspace,
  compareManifests,
  majorOf,
  parseSpecifier,
  satisfiesCaret
} from "../../scripts/checks/manifest-parity.ts";
import { describeRatchet, ratchet } from "../../scripts/checks/lib/ratchet.ts";
import { REPO_ROOT, readBaseline } from "../../scripts/checks/lib/repo.ts";

const BASELINE = "tests/architecture/known-manifest-drift.txt";

const agreeing = {
  deno: {
    name: "@tutors/example",
    version: "1.2.3",
    exports: "./src/index.ts",
    imports: { "js-yaml": "npm:js-yaml@^4.1.1", "@types/js-yaml": "npm:@types/js-yaml@^4" }
  },
  node: {
    name: "@tutors/example",
    version: "1.2.3",
    exports: { ".": "./src/index.ts" },
    dependencies: { "js-yaml": "^4.3.0" }
  }
};

describe("JSR / Node manifest parity (runway tier A)", () => {
  it("accepts manifests that agree, including string vs object exports and @types imports", () => {
    expect(compareManifests("pkg", agreeing.deno, agreeing.node)).toEqual([]);
  });

  describe("negative fixtures", () => {
    it("flags a version bumped in only one manifest", () => {
      const findings = compareManifests("pkg", agreeing.deno, { ...agreeing.node, version: "1.2.4" });
      expect(findings).toEqual(["pkg: version differs (deno.json 1.2.3, package.json 1.2.4)"]);
    });

    it("flags a renamed package", () => {
      expect(compareManifests("pkg", agreeing.deno, { ...agreeing.node, name: "@tutors/other" })).toHaveLength(1);
    });

    it("flags an export added on one side", () => {
      const node = { ...agreeing.node, exports: { ".": "./src/index.ts", "./extra": "./src/extra.ts" } };
      expect(compareManifests("pkg", agreeing.deno, node)).toEqual([
        'pkg: export "./extra" differs (deno.json undefined, package.json ./src/extra.ts)'
      ]);
    });

    it("flags a dependency on a different major", () => {
      const node = { ...agreeing.node, dependencies: { "js-yaml": "^5.0.0" } };
      expect(compareManifests("pkg", agreeing.deno, node)).toEqual([
        "pkg: dependency js-yaml major differs (deno.json ^4.1.1, package.json ^5.0.0)"
      ]);
    });

    it("flags a dependency present on only one side", () => {
      const node = { ...agreeing.node, dependencies: { "js-yaml": "^4.0.0", archiver: "^7.0.0" } };
      expect(compareManifests("pkg", agreeing.deno, node)).toEqual([
        "pkg: dependency archiver is in package.json but not in deno.json imports"
      ]);
      expect(compareManifests("pkg", agreeing.deno, { ...agreeing.node, dependencies: {} })).toEqual([
        "pkg: dependency js-yaml is in deno.json imports but not in package.json"
      ]);
    });
  });

  it("parses specifiers and ranges", () => {
    expect(parseSpecifier("npm:@mdit/plugin-katex@^1.0.2")).toEqual({
      registry: "npm",
      name: "@mdit/plugin-katex",
      range: "^1.0.2"
    });
    expect(parseSpecifier("jsr:@tutors/tutors-model-lib@^5.2.3")?.registry).toBe("jsr");
    expect(parseSpecifier("./local.ts")).toBeUndefined();
    expect(majorOf("^14.2.0")).toBe(14);
    expect(majorOf("latest")).toBeUndefined();
    expect(satisfiesCaret("5.2.3", "^5.2.3")).toBe(true);
    expect(satisfiesCaret("5.9.0", "^5.2.3")).toBe(true);
    expect(satisfiesCaret("5.2.2", "^5.2.3")).toBe(false);
    expect(satisfiesCaret("6.0.0", "^5.2.3")).toBe(false);
    expect(satisfiesCaret("5.2.3", "5.2.3")).toBe(true);
  });

  it("the repo adds no drift beyond the baseline, and the baseline has no stale entries", () => {
    const result = ratchet(checkJsrWorkspace(), readBaseline(resolve(REPO_ROOT, BASELINE)));
    expect(result, describeRatchet("manifest parity", BASELINE, result)).toEqual({ added: [], stale: [] });
  });
});
