@developer
Feature: CHANGELOG hint check
  As a contributor to Tutors
  I want the artefact hint on my pull request's title checked against what my diff moves
  So that the release harness reads my change as declared, and no follow-up claims pull request is owed

  The check is scripts/checks/changelog-hint.ts, run by .github/workflows/changelog-hint.yml on every pull
  request to main. The release harness reads the hint from the title first, else from the body's CHANGELOG
  line (CONTRIBUTING.md#changelog-entries). On 20 Oct 2026 the forecast owed 19 differences because #518
  and #519 moved @supabase/* between the reader's and time's images and wrote only (persistence).
  The check only requires what a diff makes certain, listed in the harness's artefact order; it never removes an
  artefact the author declared.

  @rule-0664 @ears-event-driven
  Rule: When a pull request changes the production dependencies of an app or a package, changes a Dockerfile instruction, or adds an error or warning log call, tutors shall require the sbom, image-manifest or logs CHANGELOG hint that change moves.

    Scenario: A new dependency in the reader requires sbom
      Given a pull request that adds "@supabase/supabase-js" to the dependencies of "apps/reader/package.json"
      When the CHANGELOG hint is checked
      Then the required hints shall be "sbom"

    Scenario: A Dockerfile instruction requires image-manifest and a new error log requires logs
      Given a pull request that adds a HEALTHCHECK instruction to "Dockerfile"
      And a pull request that adds a log.error call to "apps/reader/src/routes/api/locks/+server.ts"
      When the CHANGELOG hint is checked
      Then the required hints shall be "logs, image-manifest"

    Scenario: Dev dependencies, Dockerfile comments and tests require nothing
      Given a pull request that adds "vitest" to the devDependencies of "apps/reader/package.json"
      And a pull request that edits a comment in "Dockerfile"
      And a pull request that adds a log.error call to "apps/reader/src/lib/locks.test.ts"
      When the CHANGELOG hint is checked
      Then no hint shall be required

  @rule-0665 @ears-event-driven
  Rule: When a pull request's CHANGELOG hint leaves out an artefact its diff requires, tutors shall add the missing artefact to the title's hint, keeping every artefact the title or the CHANGELOG line already declared.

    Scenario: The missing artefact joins the title's hint
      Given a pull request titled "fix(reader): check the educator on the server (persistence)"
      And a pull request that adds "@supabase/supabase-js" to the dependencies of "apps/reader/package.json"
      When the CHANGELOG hint is checked
      Then the title shall become "fix(reader): check the educator on the server (persistence, sbom)"

    Scenario: A hint in the CHANGELOG line moves to the title with the missing artefact
      Given a pull request titled "fix(reader): check the educator on the server"
      And its body has the CHANGELOG line "- [x] CHANGELOG: `Locks are checked on the server (persistence)`"
      And a pull request that adds "@supabase/supabase-js" to the dependencies of "apps/reader/package.json"
      When the CHANGELOG hint is checked
      Then the title shall become "fix(reader): check the educator on the server (persistence, sbom)"

    Scenario: A title that already declares the artefact is left alone
      Given a pull request titled "fix(reader): check the educator on the server (sbom, persistence)"
      And a pull request that adds "@supabase/supabase-js" to the dependencies of "apps/reader/package.json"
      When the CHANGELOG hint is checked
      Then the title shall stay as it is

  @rule-0666 @ears-unwanted
  Rule: If tutors cannot edit the title of a pull request whose CHANGELOG hint leaves out a required artefact, then tutors shall fail the hint check with the title to use, except for a bot's pull request, which gets a warning.

    Scenario: A fork's pull request fails with the title to use
      Given the pull request comes from a fork
      When its hint leaves out a required artefact
      Then the check shall fail
      And the message shall name the title to use

    Scenario: A bot's pull request gets a warning
      Given the pull request is a bot's
      When its hint leaves out a required artefact
      Then the check shall warn
      And the message shall name the title to use

    Scenario: A branch in the repository has its title edited
      Given the pull request comes from a branch in the repository
      When its hint leaves out a required artefact
      Then the title shall be edited
