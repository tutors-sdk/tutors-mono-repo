import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { rulesInWorkingTree } from "../../scripts/checks/lib/rules-index.ts";
import { ARTEFACTS, isBroad, parseArgs, validateClaimsText } from "../../scripts/checks/release-claims.ts";

/**
 * A snapshot of ARTEFACTS in tutors-release-harness src/types.ts, as of harness 1.3.0 (contract 1.3.0;
 * the vocabulary has been unchanged since 1.2.0, where `bus`, `image-manifest`, `sbom`, `vulns`,
 * `runtime` and `startup` were added). It is copied, never fetched: the harness is not reachable at test
 * time. When the harness changes its list, this fails on purpose: update this snapshot and ARTEFACTS in
 * scripts/checks/release-claims.ts together, then the tables in release/README.md, CONTRIBUTING.md,
 * CHANGELOG.md and release/claims.yaml.
 */
const HARNESS_ARTEFACTS = [
  "dom", "screenshot", "network", "console", "headers", "axe", "focus", "metrics", "logs", "timing",
  "persistence", "bus", "migration", "upgrade",
  "image-manifest", "sbom", "vulns",
  "runtime", "startup"
] as const;

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
    for (const artefact of HARNESS_ARTEFACTS) {
      const claim = ["claims:", `  - artefact: ${artefact}`, '    scope: "x"', '    reason: "CHANGELOG 16.4.0: an entry"'].join("\n");
      expect(validateClaimsText(claim), artefact).toEqual([]);
    }
    expect(validateClaimsText('claims:\n  - artefact: "*"\n    scope: "x"\n    reason: "CHANGELOG 16.4.0: an entry"\n    approvedBy: "a person"\n')).toEqual([]);
    expect(validateClaimsText("version: 1\nclaims: []\n")).toEqual([]);
    expect(validateClaimsText("version: 2\nclaims: []\n")).toEqual(["version must be 1 or absent"]);
  });

  it("accepts each artefact the harness added in contract 1.2.0, which the pre-check once refused", () => {
    for (const artefact of ["sbom", "vulns", "image-manifest", "runtime", "startup", "bus"]) {
      const claim = ["claims:", `  - artefact: ${artefact}`, '    scope: "reader/x"', '    reason: "CHANGELOG 16.4.0: an entry"'].join("\n");
      expect(validateClaimsText(claim), artefact).toEqual([]);
      const byRule = ["claims:", `  - artefact: ${artefact}`, '    scope: "reader/x"', '    rule: "0031"'].join("\n");
      expect(validateClaimsText(byRule, new Set(["0031"])), artefact).toEqual([]);
    }
  });

  it("rejects an unknown artefact and lists every valid name, in the harness's order", () => {
    const [error, ...rest] = validateClaimsText('claims:\n  - artefact: pixels\n    scope: "x"\n    reason: "CHANGELOG 16.4.0: an entry"\n');
    expect(rest).toEqual([]);
    expect(error).toContain(`artefact must be one of ${HARNESS_ARTEFACTS.join(", ")} or "*"`);
    expect(error).toContain("pixels");
    // near misses of the new names are still unknown
    for (const artefact of ["SBOM", "vuln", "image_manifest", "images"]) {
      expect(validateClaimsText(`claims:\n  - artefact: ${artefact}\n    scope: "x"\n    reason: "CHANGELOG 16.4.0: an entry"\n`)).toHaveLength(1);
    }
  });

  it("mirrors the harness's artefact list exactly (a snapshot; the harness is not fetched here)", () => {
    expect([...ARTEFACTS]).toEqual([...HARNESS_ARTEFACTS]);
    expect(new Set(ARTEFACTS).size).toBe(ARTEFACTS.length);
  });

  it("is the vocabulary that release/README.md, CONTRIBUTING.md, CHANGELOG.md and release/claims.yaml document", () => {
    for (const file of ["release/README.md", "CONTRIBUTING.md", "CHANGELOG.md", "release/claims.yaml"]) {
      const text = readFileSync(join(REPO_ROOT, file), "utf8");
      for (const artefact of HARNESS_ARTEFACTS) expect(text, `${file} names ${artefact}`).toContain(artefact);
    }
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

    describe("the rule field", () => {
      const withRule = (fields: string) => `claims:\n  - artefact: dom\n    scope: "reader:lab-step*"\n${fields}`;

      it("stands in for the reason when it names a Rule the release defines", () => {
        expect(validateClaimsText(withRule('    rule: "0031"\n'), ids)).toEqual([]);
        expect(validateClaimsText(withRule('    rule: "0031"\n    reason: "lab steps show the time to read"\n'), ids)).toEqual([]);
      });

      it("still lets a reason cite the same Rule in the old form, and agrees with it", () => {
        expect(validateClaimsText(withRule('    rule: "0031"\n    reason: "Rule 0031: lab steps shall show estimated reading time"\n'), ids)).toEqual([]);
        expect(validateClaimsText(withRule('    rule: "0031"\n    reason: "Rule 0044: presence polled every 15s"\n'), ids)).toEqual([
          "claims[0]: rule is 0031 but reason cites Rule 0044; a claim is about one Rule"
        ]);
      });

      it("must resolve in the Rules it is given", () => {
        expect(validateClaimsText(withRule('    rule: "0099"\n'), ids)).toEqual([expect.stringContaining("claims[0]: rule 0099 is not defined by any feature")]);
        expect(validateClaimsText(withRule('    rule: "0099"\n    reason: "a long enough reason"\n'), ids)).toEqual([expect.stringContaining("rule 0099 is not defined")]);
        // no Rules to resolve against: only the form is checked, as with a citation in a reason
        expect(validateClaimsText(withRule('    rule: "0099"\n'))).toEqual([]);
      });

      it("is a four-digit string, not a number or free text", () => {
        const form = 'claims[0]: rule must be a four-digit Rule id in quotes, as in rule: "0031"';
        expect(validateClaimsText(withRule("    rule: 31\n"), ids)).toEqual([form]);
        expect(validateClaimsText(withRule("    rule: 0031\n"), ids)).toEqual([form]);
        expect(validateClaimsText(withRule('    rule: "Rule 0031"\n'), ids)).toEqual([form]);
        expect(validateClaimsText(withRule('    rule: ""\n'), ids)).toEqual([form]);
      });

      it("does not excuse a reason that is missing without a rule, or a rubber stamp beside one", () => {
        expect(validateClaimsText(withRule(""), ids)).toEqual([expect.stringContaining("reason is required")]);
        expect(validateClaimsText(withRule('    rule: "0031"\n    reason: "see PR 12 for details"\n'), ids)).toEqual([
          "claims[0]: a reason names a Rule or a changelog entry, not a rubber stamp"
        ]);
      });

      it("keeps a broad claim needing a person", () => {
        const broad = 'claims:\n  - artefact: "*"\n    scope: "reader:*"\n    rule: "0031"\n';
        expect(validateClaimsText(broad, ids)).toEqual(["claims[0]: a broad claim needs approvedBy (a person, never a bot)"]);
      });
    });

    it("reads its arguments: a file, and the ref whose Rules to resolve against", () => {
      expect(parseArgs([])).toEqual({ arg: "release/claims.yaml", ref: undefined });
      expect(parseArgs(["other.yaml", "--ref", "release/16.3.0"])).toEqual({ arg: "other.yaml", ref: "release/16.3.0" });
      expect(() => parseArgs(["--ref"])).toThrow(/--ref needs/);
      expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
      expect(() => parseArgs(["a", "b"])).toThrow(/only one/);
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
