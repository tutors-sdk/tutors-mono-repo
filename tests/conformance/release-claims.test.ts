import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { isBroad, validateClaimsText } from "../../scripts/checks/release-claims.ts";

describe("release claims shape check", () => {
  it("accepts the committed release/claims.yaml", () => {
    expect(validateClaimsText(readFileSync(join(REPO_ROOT, "release/claims.yaml"), "utf8"))).toEqual([]);
  });

  it("accepts an empty list and the harness's own example", () => {
    expect(validateClaimsText("claims: []\n")).toEqual([]);
    const example = [
      "claims:",
      "  - artefact: dom",
      '    scope: "reader:lab-step*"',
      '    reason: "Rule 0031: lab steps shall show estimated reading time"',
      "  - artefact: network",
      '    scope: "GET /api/presence"',
      '    reason: "Rule 0044: presence polled every 15s, was 10s"'
    ].join("\n");
    expect(validateClaimsText(example)).toEqual([]);
  });

  it("rejects a file the harness would reject", () => {
    expect(validateClaimsText("")).not.toEqual([]);
    expect(validateClaimsText("claims:\n")).not.toEqual([]);
    expect(validateClaimsText("- artefact: dom\n")).not.toEqual([]);
    expect(validateClaimsText("claims: [\n")[0]).toMatch(/not valid YAML/);
  });

  it("accepts the whole harness vocabulary and the optional version", () => {
    for (const artefact of ["focus", "persistence", "migration", "upgrade"]) {
      const claim = ["claims:", `  - artefact: ${artefact}`, '    scope: "x"', '    reason: "CHANGELOG 16.4.0: an entry"'].join("\n");
      expect(validateClaimsText(claim)).toEqual([]);
    }
    expect(validateClaimsText("version: 1\nclaims: []\n")).toEqual([]);
    expect(validateClaimsText("version: 2\nclaims: []\n")).toEqual(["version must be 1 or absent"]);
  });

  it("names the claim and the field at fault", () => {
    const errors = validateClaimsText(
      ["claims:", "  - artefact: pixels", '    scope: ""', '    reason: "see PR 12 for details"', "    approved: true"].join("\n")
    );
    expect(errors).toEqual([
      "claims[0]: unknown field `approved`",
      expect.stringContaining("claims[0]: artefact must be one of"),
      "claims[0]: scope is required",
      "claims[0]: a reason names a Rule or a changelog entry, not a rubber stamp"
    ]);
  });

  it("requires a person on a broad claim", () => {
    const broad = (extra: string) => `claims:\n  - artefact: "*"\n    scope: "reader:*"\n    reason: "CHANGELOG 16.3.0: new theme"\n${extra}`;
    expect(validateClaimsText(broad(""))).toEqual(["claims[0]: a broad claim needs approvedBy (a person, never a bot)"]);
    expect(validateClaimsText(broad('    approvedBy: "A Maintainer"\n'))).toEqual([]);
    expect(isBroad({ artefact: "dom", scope: "**" })).toBe(true);
    expect(isBroad({ artefact: "dom", scope: "reader:*" })).toBe(false);
  });
});
