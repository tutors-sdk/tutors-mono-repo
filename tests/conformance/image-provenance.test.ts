import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";

/**
 * image-build.yml attaches SLSA v1 build provenance to every image it builds, keyless under the same identity as the
 * signature and the SBOM. The release harness's build-provenance check (tutors-release-harness,
 * src/image-static/provenance.ts) runs `cosign verify-attestation --type slsaprovenance1` with that identity and passes
 * an image only when a statement about its digest names `.github/workflows/image-build.yml` as its builder
 * (`runDetails.builder.id`) or its workflow (`buildDefinition.externalParameters.workflow.path`).
 */
interface Step {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
}

const text = readFileSync(join(REPO_ROOT, ".github/workflows/image-build.yml"), "utf8").replaceAll("\r\n", "\n");
const doc = yaml.load(text) as { jobs: Record<string, { permissions?: Record<string, string>; steps: Step[] }> };
const steps = doc.jobs.publish.steps;
const at = (name: string) => steps.findIndex((step) => step.name === name);
const WRITE = "Write the SLSA provenance predicate";
const ATTEST = "Attest the SLSA provenance to the pushed digest";
/** The harness's test for "built by the monorepo's publishing workflow" (src/compare/policy.ts, PUBLISHING_WORKFLOW). */
const PUBLISHING_WORKFLOW = /\.github\/workflows\/image-build\.ya?ml/;
/** The identity deploy/README.md documents and the harness verifies signatures and attestations under. */
const IDENTITY = "^https://github.com/tutors-sdk/tutors-mono-repo/\\.github/workflows/image-build\\.yml@";

/** Run the predicate step's script as the runner would on a push to main, with the step's env resolved. */
function writePredicate(): Record<string, unknown> {
  const step = steps[at(WRITE)]!;
  const dir = mkdtempSync(join(tmpdir(), "slsa-predicate-"));
  const r = spawnSync("bash", ["-e", "-c", step.run!], {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "tutors-sdk/tutors-mono-repo",
      GITHUB_WORKFLOW_REF: "tutors-sdk/tutors-mono-repo/.github/workflows/image-build.yml@refs/tags/v17.1.0-rc.1",
      GITHUB_WORKFLOW_SHA: "a".repeat(40),
      GITHUB_RUN_ID: "123456",
      GITHUB_RUN_ATTEMPT: "2",
      APP: "time",
      SOURCE_REF: "refs/tags/v17.1.0-rc.1",
      SOURCE_SHA: "b".repeat(40),
      EVENT_NAME: "push",
      PREDICATE: "provenance-time.slsa.json"
    },
    encoding: "utf8"
  });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(readFileSync(join(dir, "provenance-time.slsa.json"), "utf8")) as Record<string, unknown>;
}

describe(".github/workflows/image-build.yml attests SLSA build provenance", () => {
  it("writes, attests and verifies the provenance for every built image, never for a promoted one", () => {
    for (const name of [WRITE, ATTEST]) {
      expect(at(name), name).toBeGreaterThan(0);
      expect(steps[at(name)]!.if).toBe("steps.plan.outputs.promoted != 'true'");
    }
    expect(at(WRITE)).toBeLessThan(at(ATTEST));
    expect(at(ATTEST)).toBeGreaterThan(at("Sign the pushed digest (keyless)"));
    expect(at(ATTEST)).toBeLessThan(at("Tag the signed digest"));
  });

  it("attests the pushed digest as slsaprovenance1 and verifies it under the publishing identity, as the harness does", () => {
    const step = steps[at(ATTEST)]!;
    expect(step.env).toMatchObject({ DIGEST: "${{ steps.push.outputs.digest }}" });
    expect(step.run).toContain('cosign attest --yes --type slsaprovenance1 --predicate "${PREDICATE}" "${IMAGE}@${DIGEST}"');
    expect(step.run).toContain("cosign verify-attestation --type slsaprovenance1");
    expect(step.run).toContain("--certificate-oidc-issuer https://token.actions.githubusercontent.com");
    const regexp = /--certificate-identity-regexp "([^"]+)"/.exec(step.run!)?.[1];
    const resolved = regexp?.replace("${GITHUB_SERVER_URL}", "https://github.com").replace("${GITHUB_REPOSITORY}", "tutors-sdk/tutors-mono-repo");
    expect(resolved).toBe(IDENTITY);
    expect(readFileSync(join(REPO_ROOT, "deploy/README.md"), "utf8")).toContain(`'${IDENTITY}'`);
    // the predicate file the write step produced is the one attested
    expect(step.env?.PREDICATE).toBe(steps[at(WRITE)]!.env?.PREDICATE);
  });

  it("names image-build.yml as the builder and the workflow, and the commit that was built", () => {
    const predicate = writePredicate() as {
      buildDefinition: { buildType: string; externalParameters: { workflow: { path: string; ref: string; repository: string }; app: string }; resolvedDependencies: { uri: string; digest: { gitCommit: string } }[] };
      runDetails: { builder: { id: string }; metadata: { invocationId: string; finishedOn: string } };
    };
    expect(predicate.runDetails.builder.id).toBe("https://github.com/tutors-sdk/tutors-mono-repo/.github/workflows/image-build.yml@refs/tags/v17.1.0-rc.1");
    expect(predicate.runDetails.builder.id).toMatch(PUBLISHING_WORKFLOW);
    expect(predicate.buildDefinition.externalParameters.workflow).toEqual({
      path: ".github/workflows/image-build.yml",
      ref: "refs/tags/v17.1.0-rc.1",
      repository: "https://github.com/tutors-sdk/tutors-mono-repo"
    });
    expect(predicate.buildDefinition.externalParameters.workflow.path).toMatch(PUBLISHING_WORKFLOW);
    expect(predicate.buildDefinition.externalParameters.app).toBe("time");
    expect(predicate.buildDefinition.resolvedDependencies).toEqual([{ uri: "git+https://github.com/tutors-sdk/tutors-mono-repo@refs/tags/v17.1.0-rc.1", digest: { gitCommit: "b".repeat(40) } }]);
    expect(predicate.runDetails.metadata.invocationId).toBe("https://github.com/tutors-sdk/tutors-mono-repo/actions/runs/123456/attempts/2");
    expect(predicate.runDetails.metadata.finishedOn).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });

  it("reads the run's context through env, never by expanding an expression inside the script", () => {
    for (const name of [WRITE, ATTEST]) expect(steps[at(name)]!.run, name).not.toContain("${{");
  });
});
