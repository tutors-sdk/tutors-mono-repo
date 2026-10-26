@developer
Feature: Release OpenVEX exceptions
  As the captain of a Tutors release
  I want the advisories that cannot affect a release written down in OpenVEX beside its claims
  So that the release harness's scanner leaves them out of the vulnerability scan, in a form any scanner reads

  The file is release/openvex.json, an OpenVEX document (https://openvex.dev). The release harness fetches it from
  beside release/claims.yaml and hands it to grype with --vex on both sides; from harness 1.23.0 it refuses a file it
  cannot use before any stack starts. The command is scripts/checks/openvex.ts (pnpm check:openvex), which holds the
  same rules as the harness so a release push fails first. A product is a package URL because the harness scans each
  image's SBOM, and grype matches a statement by the vulnerable package's purl.

  @rule-0226 @ears-event-driven
  Rule: When a maintainer checks release/openvex.json, tutors shall accept an OpenVEX document with the OpenVEX context, an id, an author, a timestamp, a version from 1 and a list of statements, empty or not.

    Scenario: The release's own file is accepted
      Given the OpenVEX file committed at release/openvex.json
      When the maintainer checks the OpenVEX file
      Then the check shall accept the OpenVEX file

    Scenario: A statement with each status written in full is accepted
      Given an OpenVEX file with a "not_affected" statement for "CVE-2026-0001" in "pkg:npm/tar@7.4.3" justified as "vulnerable_code_not_in_execute_path"
      And the OpenVEX file also has an "affected" statement for "CVE-2026-0002" in "pkg:npm/tar@7.4.3" with the action "upgrade tar in the next patch release"
      And the OpenVEX file also has a "fixed" statement for "CVE-2026-0003" in "pkg:npm/tar@7.4.3"
      And the OpenVEX file also has an "under_investigation" statement for "CVE-2026-0004" in "pkg:npm/tar@7.4.3"
      When the maintainer checks the OpenVEX file
      Then the check shall accept the OpenVEX file

  @rule-0227 @ears-unwanted
  Rule: If a not_affected statement in release/openvex.json gives no standard OpenVEX justification, then tutors shall reject the file and name the statement.

    Scenario: An impact statement alone does not justify not_affected
      Given an OpenVEX file with a "not_affected" statement for "CVE-2026-0001" in "pkg:npm/tar@7.4.3" explained only as "we never call it"
      When the maintainer checks the OpenVEX file
      Then the check shall reject the OpenVEX file naming "statement 1"
      And the rejection shall list the standard justification "vulnerable_code_not_in_execute_path"

    Scenario: A justification outside the standard five is rejected
      Given an OpenVEX file with a "not_affected" statement for "CVE-2026-0001" in "pkg:npm/tar@7.4.3" justified as "trust_me"
      When the maintainer checks the OpenVEX file
      Then the check shall reject the OpenVEX file naming "statement 1"

  @rule-0228 @ears-unwanted
  Rule: If release/openvex.json lacks a field the release harness reads, then tutors shall reject the file and name the field.

    Scenario: A product that is an image, not a package URL, is rejected
      Given an OpenVEX file with a "fixed" statement for "CVE-2026-0001" in "ghcr.io/tutors-sdk/reader:16.2.2"
      When the maintainer checks the OpenVEX file
      Then the check shall reject the OpenVEX file naming "products"

    Scenario: An affected statement with no action is rejected
      Given an OpenVEX file with an "affected" statement for "CVE-2026-0001" in "pkg:npm/tar@7.4.3" and no action
      When the maintainer checks the OpenVEX file
      Then the check shall reject the OpenVEX file naming "action_statement"

    Scenario: A document that is not OpenVEX is rejected
      Given an OpenVEX file with no context and no statements
      When the maintainer checks the OpenVEX file
      Then the check shall reject the OpenVEX file naming "@context"
      And the rejection shall also name "statements"

  @rule-0229 @ears-event-driven
  Rule: When a release branch is pushed, tutors shall check release/openvex.json in the same job that checks release/claims.yaml.

    Scenario: The release claims workflow checks the OpenVEX file
      Given the release claims workflow
      When a release branch is pushed
      Then the job that runs "pnpm check:release-claims" shall also run "pnpm check:openvex"
