@developer
Feature: Release changelog
  As the author of a Tutors release
  I want a changelog generated from the pull requests merged since production, with the EARS Rules each one moved
  So that CHANGELOG.md, the release claims and the release harness scorecard start from the same complete list

  The generator is scripts/release-changelog.ts (pnpm release:changelog). CHANGELOG.md stays curated by hand;
  the generated file is the draft it is curated from. The scenarios run the generator on a small git history
  built by the steps: tag v1, then on main a feature pull request #10 that adds Rule 0002, a fix pull request #11
  with no description, a commit straight to main that rewords Rule 0001, the release branch coming back as
  pull request #12, and a squash-merged chore #13.

  @rule-0190 @ears-event-driven
  Rule: When a release author generates the changelog between two refs, tutors shall list every pull request merged on the first-parent history between them once, leaving out merges of a release branch.

    Scenario: Every pull request since the tag is listed once
      Given the example history from "v1" to "main"
      When the changelog is generated
      Then it shall list pull requests 10, 11 and 13 once each
      And it shall not list pull request 12

  @rule-0191 @ears-ubiquitous
  Rule: Tutors shall list each changelog entry under the product section with the most changed files and under the heading of its Conventional Commits type, keeping the artefact hints of its title.

    Scenario: Entries are grouped by product section and change type
      Given the example history from "v1" to "main"
      When the changelog is generated
      Then pull request 10 shall be listed under "Reader" and "Features" as "Quiz wall" with hints "dom, screenshot"
      And pull request 11 shall be listed under "Shared Packages" and "Fixes" as "Presence poll interval"
      And the squash-merged pull request 13 shall be listed under "Development" and "Chores" as "Bump eslint"

  @rule-0192 @ears-event-driven
  Rule: When a pull request adds, changes or removes an EARS Rule, tutors shall name the Rule id on the pull request's changelog entry and name the pull request against the Rule in the release's Rules table.

    Scenario: A Rule and its pull request name each other
      Given the example history from "v1" to "main"
      When the changelog is generated
      Then the entry for pull request 10 shall name Rule "0002"
      And the release's Rules table shall list Rule "0002" as "added" by pull request 10
      And the Markdown shall contain "| 0002 | added | #10 |"

  @rule-0193 @ears-unwanted
  Rule: If a commit on the first-parent history did not come from a pull request, then tutors shall list it in the changelog with its commit hash and mark it as not from a pull request.

    Scenario: A commit straight to main is listed and marked
      Given the example history from "v1" to "main"
      When the changelog is generated
      Then the commit "Tidy the live menus" shall be listed as not from a pull request
      And its entry shall name Rule "0001"

  @rule-0194 @ears-event-driven
  Rule: When rules.json is written with a since ref, tutors shall give each Rule added or changed after that ref the pull requests that touched it.

    Scenario: rules.json names the pull requests behind a Rule
      Given the example history from "v1" to "main"
      When rules.json is written for "main" since "v1"
      Then Rule "0002" shall carry pull requests "10"
      And Rule "0001" shall carry no pull requests

  @rule-0195 @ears-event-driven
  Rule: When a release candidate is tagged, tutors shall publish the candidate's generated changelog as the notes and assets of the candidate's prerelease.

    Scenario: The dispatch workflow publishes the changelog with the Rules
      Given the release candidate dispatch workflow
      Then its rules job shall check out the full history
      And its publish step shall generate the changelog from the production ref to the candidate
      And its publish step shall upload "changelog.md" and "changelog.json"
      And its publish step shall write rules.json with pull requests since the production ref
