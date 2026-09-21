import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { rulesInWorkingTree } from "../../scripts/checks/lib/rules-index.ts";
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

  describe("Rule citations", () => {
    const claim = (reason: string) => `claims:\n  - artefact: dom\n    scope: "reader:lab-step*"\n    reason: ${JSON.stringify(reason)}\n`;
    const ids = new Set(["0031", "0044"]);

    it("accepts a reason that cites a Rule the release defines", () => {
      expect(validateClaimsText(claim("Rule 0031: lab steps shall show estimated reading time"), ids)).toEqual([]);
      expect(validateClaimsText(claim("rule 0044 presence polled every 15s"), ids)).toEqual([]);
    });

    it("rejects a Rule id the release does not define, and one that is not four digits", () => {
      expect(validateClaimsText(claim("Rule 0099: presence polled every 15s"), ids)).toEqual([
        expect.stringContaining("claims[0]: reason cites Rule 0099, which no feature under tests/bdd/features defines")
      ]);
      expect(validateClaimsText(claim("Rule 31: lab steps shall show estimated reading time"), ids)).toEqual([
        'claims[0]: Rule ids have four digits, as in "Rule 0031"; "31" is not one'
      ]);
    });

    it("leaves a CHANGELOG reason, and a reason that only starts with the word Rule, as free text", () => {
      expect(validateClaimsText(claim("CHANGELOG 16.3.0: collapsed state for lab steps"), ids)).toEqual([]);
      expect(validateClaimsText(claim("Ruleset update in fix(reader): #270 CSP allows the new video host"), ids)).toEqual([]);
      expect(validateClaimsText(claim("Rule of thumb changed in fix(reader): #270"), ids)).toEqual([]);
    });

    it("does not resolve citations when no Rule ids are given, as before", () => {
      expect(validateClaimsText(claim("Rule 0099: presence polled every 15s"))).toEqual([]);
    });

    it("accepts the committed release/claims.yaml against the Rules the repository defines", () => {
      const defined = new Set(rulesInWorkingTree().keys());
      expect(defined.size).toBeGreaterThan(0);
      expect(validateClaimsText(readFileSync(join(REPO_ROOT, "release/claims.yaml"), "utf8"), defined)).toEqual([]);
    });
  });

  it("requires a person on a broad claim", () => {
    const broad = (extra: string) => `claims:\n  - artefact: "*"\n    scope: "reader:*"\n    reason: "CHANGELOG 16.3.0: new theme"\n${extra}`;
    expect(validateClaimsText(broad(""))).toEqual(["claims[0]: a broad claim needs approvedBy (a person, never a bot)"]);
    expect(validateClaimsText(broad('    approvedBy: "A Maintainer"\n'))).toEqual([]);
    expect(isBroad({ artefact: "dom", scope: "**" })).toBe(true);
    expect(isBroad({ artefact: "dom", scope: "reader:*" })).toBe(false);
  });
});
