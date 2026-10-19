import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  AUTHORISATION_GAPS_PATH,
  AUTHORISATION_MATRIX_PATH,
  ROLES,
  cellFindings,
  matrixFindings,
  parseMatrix,
  parseGaps,
  type KnownGap,
  type Matrix,
  type Observation
} from "../../../../scripts/checks/authorisation.ts";
import { REPO_ROOT, readText } from "../../../../scripts/checks/lib/repo.ts";
import { discoverEndpoints } from "../../../../scripts/checks/security.ts";

const feature = await loadFeature("tests/bdd/features/developer/authorisation-matrix.feature");

const committed = (): Matrix => parseMatrix(readText(`${REPO_ROOT}/${AUTHORISATION_MATRIX_PATH}`));
const committedGaps = () => parseGaps(readText(`${REPO_ROOT}/${AUTHORISATION_GAPS_PATH}`));

describeFeature(feature, ({ Rule }) => {
  Rule(
    "Tutors shall fail the build when a server route has no entry in the authorisation matrix, when an entry names a route no file declares, or when an entry leaves a role without an expected status.",
    ({ RuleScenario }) => {
      RuleScenario("A route missing from the matrix fails the build", ({ Given, When, Then }) => {
        let matrix: Matrix;
        let findings: string[] = [];
        Given("a matrix without the entry for {string}", (_ctx, key: string) => {
          matrix = { entries: committed().entries.filter((e) => e.key !== key) };
        });
        When("the matrix is checked against the routes the apps declare", () => {
          findings = matrixFindings(discoverEndpoints(), matrix);
        });
        Then("the finding says {string}", (_ctx, finding: string) => {
          expect(findings.some((f) => f.startsWith(finding)), findings.join("\n")).toBe(true);
        });
      });

      RuleScenario("A stale entry and an unanswered role fail the build", ({ Given, When, Then }) => {
        let matrix: Matrix;
        let findings: string[] = [];
        Given("a matrix with an entry for {string} and an entry that names only the lecturer", (_ctx, key: string) => {
          const entries = committed().entries.map((e) => (e.key === "reader GET /version" ? { ...e, expect: { lecturer: 200 } } : e));
          matrix = { entries: [...entries, { key, request: { path: "/api/gone" }, expect: { "*": 401 } }] };
        });
        When("the matrix is checked against the routes the apps declare", () => {
          findings = matrixFindings(discoverEndpoints(), matrix);
        });
        Then("the findings say {string} and {string}", (_ctx, stale: string, unanswered: string) => {
          expect(findings.some((f) => f.startsWith(stale)), findings.join("\n")).toBe(true);
          expect(findings.some((f) => f.includes(unanswered)), findings.join("\n")).toBe(true);
        });
      });

      RuleScenario("A mismatch no gap explains fails, and a gap that no longer occurs fails", ({ Given, When, Then }) => {
        let matrix: Matrix;
        let observations: Observation[] = [];
        Given("the committed matrix", () => {
          matrix = committed();
        });
        const gaps: KnownGap[] = [{ key: "reader PUT /api/courses/[courseid]/locks", role: "lecturer", got: 503, why: "a fixture gap" }];
        When("the enrollment export answers 200 to a student and a listed lock gap now answers 200", () => {
          observations = [
            { key: "reader GET /api/courses/[courseid]/enrollment", role: "student", status: 200 },
            { key: "reader GET /api/courses/[courseid]/enrollment", role: "lecturer", status: 200 },
            { key: "reader PUT /api/courses/[courseid]/locks", role: "lecturer", status: 200 },
            { key: "reader PUT /api/courses/[courseid]/locks", role: "student", status: 403 }
          ];
        });
        Then("the findings say {string} and {string}", (_ctx, unexpected: string, stale: string) => {
          const findings = cellFindings(observations, matrix, gaps);
          expect(findings.some((f) => f.startsWith(unexpected)), findings.join("\n")).toBe(true);
          expect(findings.some((f) => f.startsWith(stale)), findings.join("\n")).toBe(true);
          expect(findings, "the lecturer's enrollment 200 and the student's lock 403 pass").toHaveLength(2);
        });
      });

      RuleScenario("The committed matrix lists every route the apps declare", ({ Given, Then, And }) => {
        let matrix: Matrix;
        Given("the committed matrix and known gaps", () => {
          matrix = committed();
        });
        Then("the matrix has no findings against the routes the apps declare", () => {
          expect(matrixFindings(discoverEndpoints(), matrix)).toEqual([]);
        });
        And("every known gap names a matrix entry and a role", () => {
          const gaps = committedGaps();
          for (const gap of gaps) {
            expect(matrix.entries.map((e) => e.key), gap.key).toContain(gap.key);
            expect(ROLES, gap.key).toContain(gap.role);
            expect(gap.why, gap.key).not.toBe("");
          }
          expect(cellFindings([], matrix, gaps)).toEqual([]);
        });
      });
    }
  );
});
