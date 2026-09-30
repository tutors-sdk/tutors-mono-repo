@developer
Feature: Release candidate
  As the captain of a Tutors release
  I want one command that tags a release candidate, publishes its images and runs the release harness on it
  So that a git ref becomes a harness report with no prompts in between, and the harness always knows what production runs

  The command is scripts/release-candidate.ts (pnpm release:candidate X.Y.Z). It plans every step first and then
  runs the plan, so the plan is what these scenarios check. The images are built by image-build.yml, which a pushed
  vX.Y.Z-rc.N tag starts. What production runs is release/deployed.json, which pnpm deploy:pin writes beside the
  overlays it pins and pnpm check:deploy-pins holds to them.

  @rule-0206 @ears-event-driven
  Rule: When a release captain asks for a release candidate of a version, tutors shall tag the captain's commit with the next release candidate number that version has not used.

    Scenario: The next free release candidate number is taken
      Given package.json is at "16.3.0"
      And the tags "v16.2.2, v16.3.0-rc.1, v16.3.0-rc.2, v16.4.0-rc.7" exist
      When the captain asks for a release candidate of "16.3.0"
      Then the candidate shall be "16.3.0-rc.3"
      And the plan shall tag the commit "v16.3.0-rc.3" and push that tag to origin

    Scenario: The first release candidate of a version is rc.1
      Given package.json is at "16.3.0"
      And the tags "v16.2.2" exist
      When the captain asks for a release candidate of "16.3.0"
      Then the candidate shall be "16.3.0-rc.1"

  @rule-0207 @ears-unwanted
  Rule: If the captain's commit already carries a release candidate tag of the version, then tutors shall reuse that tag and create no new tag.

    Scenario: A commit that is already a candidate is not tagged twice
      Given package.json is at "16.3.0"
      And the tags "v16.3.0-rc.1, v16.3.0-rc.2" exist
      And the commit carries the tag "v16.3.0-rc.2"
      When the captain asks for a release candidate of "16.3.0"
      Then the candidate shall be "16.3.0-rc.2"
      And the plan shall create no tag

  @rule-0208 @ears-unwanted
  Rule: If package.json does not carry the requested version or that version is already tagged as a release, then tutors shall refuse the release candidate and plan no command.

    Scenario: A version package.json does not carry is refused
      Given package.json is at "16.2.2"
      And the tags "v16.2.2" exist
      When the captain asks for a release candidate of "16.3.0"
      Then the release candidate shall be refused with "package.json is at 16.2.2"

    Scenario: A version already released is refused
      Given package.json is at "16.3.0"
      And the tags "v16.3.0-rc.1, v16.3.0" exist
      When the captain asks for a release candidate of "16.3.0"
      Then the release candidate shall be refused with "v16.3.0 is already tagged"

  @rule-0209 @ears-event-driven
  Rule: When a release candidate is tagged, tutors shall run the release harness against production only after the registry serves the candidate's reader, catalogue, live and time images.

    Scenario: The harness runs after all four images are published
      Given package.json is at "16.3.0"
      And the tags "v16.3.0-rc.1" exist
      When the captain asks for a release candidate of "16.3.0"
      Then the plan shall wait for "quay.io/tutors-sdk/tutors-reader:16.3.0-rc.2, quay.io/tutors-sdk/tutors-catalogue:16.3.0-rc.2, quay.io/tutors-sdk/tutors-live:16.3.0-rc.2, quay.io/tutors-sdk/tutors-time:16.3.0-rc.2" after pushing the tag
      And the last step of the plan shall run the harness with "release --candidate 16.3.0-rc.2 --baseline prod --monorepo"

  @rule-0210 @ears-optional
  Rule: Where HARNESS_DIR names a harness checkout, tutors shall run the release harness from that checkout instead of the published harness package.

    @active
    Scenario: A local harness checkout is used
      Given package.json is at "16.3.0"
      And HARNESS_DIR is "/work/tutors-release-harness"
      When the captain asks for a release candidate of "16.3.0"
      Then the harness shall run as "pnpm harness release" in "/work/tutors-release-harness"

    @inactive
    Scenario: Without HARNESS_DIR the published harness package is used
      Given package.json is at "16.3.0"
      When the captain asks for a release candidate of "16.3.0"
      Then the harness shall run as "npx --yes github:tutors-sdk/tutors-release-harness release" in the monorepo checkout

  @rule-0211 @ears-optional
  Rule: Where the captain asks for a dry run, tutors shall print every command of the release candidate and run none of them.

    @active
    Scenario: A dry run prints the plan and runs nothing
      Given package.json is at "16.3.0"
      And the tags "v16.3.0-rc.1" exist
      When the captain asks for a dry run of a release candidate of "16.3.0"
      Then every command of the plan shall be printed
      And no command shall be run

    @inactive
    Scenario: Without a dry run every command is run in order
      Given package.json is at "16.3.0"
      And the tags "v16.3.0-rc.1" exist
      When the captain asks for a release candidate of "16.3.0" and every command succeeds
      Then every command of the plan shall be run in order

  @rule-0212 @ears-event-driven
  Rule: When production is pinned to a release, tutors shall record the release's tag, commit, pin time and four image digests in release/deployed.json.

    Scenario: Pinning production writes the deployed record
      Given production is pinned to "16.2.2" at commit "caa53d021e63004ad6e52a76428f8acd95a87c21" at "2026-09-21T08:40:05Z"
      When the deployed record is written
      Then release/deployed.json shall name tag "16.2.2", commit "caa53d021e63004ad6e52a76428f8acd95a87c21" and deployedAt "2026-09-21T08:40:05Z"
      And release/deployed.json shall carry the digests of reader, catalogue, live and time

  @rule-0213 @ears-unwanted
  Rule: If release/deployed.json does not name the tag and digests the deploy overlays pin, then tutors shall fail the deploy pin check.

    Scenario: A deployed record that lags the overlays fails the check
      Given the overlays are pinned to "16.3.0"
      And release/deployed.json names "16.2.2"
      When the deploy pins are checked
      Then the check shall report "deployed-tag-differs"

    Scenario: The committed deployed record agrees with the committed overlays
      Given the committed overlays and release/deployed.json
      When the deploy pins are checked
      Then the check shall report nothing
