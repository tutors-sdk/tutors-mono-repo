import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import yaml from "js-yaml";
import { expect } from "vitest";
import { validateClaimsText } from "../../../../scripts/checks/release-claims.ts";

const feature = await loadFeature("tests/bdd/features/developer/release-claims-lifetime.feature");

type Claim = { artefact: string; scope: string; reason: string; until?: string; digests?: Record<string, string> };

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  let claims: Claim[];
  let errors: string[];

  BeforeEachScenario(() => {
    claims = [];
    errors = [];
  });

  const last = () => claims[claims.length - 1]!;
  const claim = (_ctx: unknown, artefact: string, scope: string, reason: string) => {
    claims.push({ artefact, scope, reason });
  };
  const until = (_ctx: unknown, value: string) => {
    last().until = value;
  };
  const against = (_ctx: unknown, app: string, digest: string) => {
    last().digests = { ...(last().digests ?? {}), [app]: digest };
  };
  // Dumped with every string quoted, as a release/claims.yaml would be written by hand: js-yaml would otherwise read an
  // unquoted 2026-11-30 back as a date.
  const check = () => {
    errors = validateClaimsText(yaml.dump({ claims }, { forceQuotes: true }));
  };
  const accepted = () => {
    expect(errors).toEqual([]);
  };
  const rejectedNaming = (_ctx: unknown, what: string) => {
    expect(errors.length, "the check rejects the file").toBeGreaterThan(0);
    expect(errors.join("\n")).toContain(what);
  };

  Rule("When a maintainer checks release/claims.yaml, tutors shall accept a claim whose artefact is one of the release harness's policy checks, image-hardening, build-provenance or vuln-ceiling.", ({ RuleScenario }) => {
    RuleScenario("A claim on each policy check is accepted", ({ Given, And, When, Then }) => {
      Given("a claims file with a claim on {string} for {string} because {string}", claim);
      And("the file also has a claim on {string} for {string} because {string}", claim);
      And("the file has a third claim on {string} for {string} because {string}", claim);
      When("the maintainer checks the claims file", check);
      Then("the check shall accept the claims file", accepted);
    });
  });

  Rule("When a maintainer checks release/claims.yaml, tutors shall accept a claim whose artefact is one of the release harness's informing checks, timing-tolerance, asset-graph or replay.", ({ RuleScenario }) => {
    RuleScenario("A claim on each informing check is accepted", ({ Given, And, When, Then }) => {
      Given("a claims file with a claim on {string} for {string} because {string}", claim);
      And("the file also has a claim on {string} for {string} because {string}", claim);
      And("the file has a third claim on {string} for {string} because {string}", claim);
      When("the maintainer checks the claims file", check);
      Then("the check shall accept the claims file", accepted);
    });
  });

  Rule("When a maintainer checks a claim in release/claims.yaml that carries until, tutors shall accept a calendar day written YYYY-MM-DD or a release written X.Y.Z or vX.Y.Z.", ({ RuleScenario }) => {
    RuleScenario("A claim meant until a day is accepted", ({ Given, And, When, Then }) => {
      Given("a claims file with a claim on {string} for {string} because {string}", claim);
      And("the claim is meant until {string}", until);
      When("the maintainer checks the claims file", check);
      Then("the check shall accept the claims file", accepted);
    });

    RuleScenario("A claim meant until a release is accepted, with or without the v", ({ Given, And, When, Then }) => {
      Given("a claims file with a claim on {string} for {string} because {string}", claim);
      And("the claim is meant until {string}", until);
      And("the file also has a claim on {string} for {string} because {string}", claim);
      And("that claim is meant until {string}", until);
      When("the maintainer checks the claims file", check);
      Then("the check shall accept the claims file", accepted);
    });
  });

  Rule("When a maintainer checks a claim in release/claims.yaml that carries digests, tutors shall accept a mapping from one or more of reader, catalogue, live and time to an image digest written sha256: and 64 lowercase hex characters.", ({ RuleScenario }) => {
    RuleScenario("A claim written against two images is accepted", ({ Given, And, When, Then }) => {
      Given("a claims file with a claim on {string} for {string} because {string}", claim);
      And("the claim was written against the {string} image {string}", against);
      And("it was also written against the {string} image {string}", against);
      When("the maintainer checks the claims file", check);
      Then("the check shall accept the claims file", accepted);
    });
  });

  Rule("If a claim's until is not a calendar day or a release, or its digests name another app or a value that is not an image digest, then tutors shall reject the file and name the claim and the field.", ({ RuleScenario }) => {
    for (const name of ["An until in words is rejected", "A day that is not on the calendar is rejected"]) {
      RuleScenario(name, ({ Given, And, When, Then }) => {
        Given("a claims file with a claim on {string} for {string} because {string}", claim);
        And("the claim is meant until {string}", until);
        When("the maintainer checks the claims file", check);
        Then("the check shall reject the claims file naming {string}", rejectedNaming);
      });
    }
    for (const name of ["A digest for an app the harness does not run is rejected", "A short digest is rejected"]) {
      RuleScenario(name, ({ Given, And, When, Then }) => {
        Given("a claims file with a claim on {string} for {string} because {string}", claim);
        And("the claim was written against the {string} image {string}", against);
        When("the maintainer checks the claims file", check);
        Then("the check shall reject the claims file naming {string}", rejectedNaming);
      });
    }
  });
});
