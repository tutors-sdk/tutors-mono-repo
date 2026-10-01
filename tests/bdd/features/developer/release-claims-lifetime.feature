@developer
Feature: Release claims with a lifetime and the policy checks
  As the captain of a Tutors release
  I want release/claims.yaml to say how long a claim is meant to last and to name the release harness's policy checks
  So that a claim written for one release cannot quietly cover the next, and a policy finding can be claimed like any difference

  The release harness (tutors-sdk/tutors-release-harness) owns the claims schema; pnpm check:release-claims
  (scripts/checks/release-claims.ts) mirrors it so a release push fails first. Harness 1.22.0 added three
  checks on the candidate alone, image-hardening, build-provenance and vuln-ceiling, which a claim names as
  its artefact. Harness 1.25.1 added a claim's lifetime: until, the last day (YYYY-MM-DD) or release (X.Y.Z)
  it is meant for, and digests, the image of each app it was written against. The harness reports an expired
  claim and, from harness 2.0, stops it covering anything.

  @rule-0230 @ears-event-driven
  Rule: When a maintainer checks release/claims.yaml, tutors shall accept a claim whose artefact is one of the release harness's policy checks, image-hardening, build-provenance or vuln-ceiling.

    Scenario: A claim on each policy check is accepted
      Given a claims file with a claim on "image-hardening" for "reader/healthcheck" because "fix(image): the healthcheck lands in the next release"
      And the file also has a claim on "build-provenance" for "reader/slsa" because "fix(image): image-build.yml publishes SLSA provenance next"
      And the file has a third claim on "vuln-ceiling" for "reader/GHSA-phwq-j96m-2c2q" because "CHANGELOG 16.3.0: ejs is bumped in the next patch release"
      When the maintainer checks the claims file
      Then the check shall accept the claims file

  @rule-0231 @ears-event-driven
  Rule: When a maintainer checks a claim in release/claims.yaml that carries until, tutors shall accept a calendar day written YYYY-MM-DD or a release written X.Y.Z or vX.Y.Z.

    Scenario: A claim meant until a day is accepted
      Given a claims file with a claim on "dom" for "reader:lab-step*" because "Rule 0031: lab steps shall show estimated reading time"
      And the claim is meant until "2026-11-30"
      When the maintainer checks the claims file
      Then the check shall accept the claims file

    Scenario: A claim meant until a release is accepted, with or without the v
      Given a claims file with a claim on "dom" for "reader:lab-step*" because "Rule 0031: lab steps shall show estimated reading time"
      And the claim is meant until "16.3.0"
      And the file also has a claim on "dom" for "reader:lab" because "Rule 0031: lab steps shall show estimated reading time"
      And that claim is meant until "v16.3.0"
      When the maintainer checks the claims file
      Then the check shall accept the claims file

  @rule-0232 @ears-event-driven
  Rule: When a maintainer checks a claim in release/claims.yaml that carries digests, tutors shall accept a mapping from one or more of reader, catalogue, live and time to an image digest written sha256: and 64 lowercase hex characters.

    Scenario: A claim written against two images is accepted
      Given a claims file with a claim on "sbom" for "reader/*" because "CHANGELOG 16.3.0: the reader image drops its package manager"
      And the claim was written against the "reader" image "sha256:4593352500000000000000000000000000000000000000000000000000000000"
      And it was also written against the "live" image "sha256:82c9535400000000000000000000000000000000000000000000000000000000"
      When the maintainer checks the claims file
      Then the check shall accept the claims file

  @rule-0233 @ears-unwanted
  Rule: If a claim's until is not a calendar day or a release, or its digests name another app or a value that is not an image digest, then tutors shall reject the file and name the claim and the field.

    Scenario: An until in words is rejected
      Given a claims file with a claim on "dom" for "reader:lab-step*" because "Rule 0031: lab steps shall show estimated reading time"
      And the claim is meant until "next week"
      When the maintainer checks the claims file
      Then the check shall reject the claims file naming "claims[0]: until"

    Scenario: A day that is not on the calendar is rejected
      Given a claims file with a claim on "dom" for "reader:lab-step*" because "Rule 0031: lab steps shall show estimated reading time"
      And the claim is meant until "2026-02-30"
      When the maintainer checks the claims file
      Then the check shall reject the claims file naming "claims[0]: until"

    Scenario: A digest for an app the harness does not run is rejected
      Given a claims file with a claim on "sbom" for "reader/*" because "CHANGELOG 16.3.0: the reader image drops its package manager"
      And the claim was written against the "web" image "sha256:4593352500000000000000000000000000000000000000000000000000000000"
      When the maintainer checks the claims file
      Then the check shall reject the claims file naming "claims[0]: digests names"

    Scenario: A short digest is rejected
      Given a claims file with a claim on "sbom" for "reader/*" because "CHANGELOG 16.3.0: the reader image drops its package manager"
      And the claim was written against the "reader" image "sha256:45933525"
      When the maintainer checks the claims file
      Then the check shall reject the claims file naming "claims[0]: digests.reader"
