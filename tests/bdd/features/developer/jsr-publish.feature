@developer
Feature: Publishing the libraries to JSR
  As Tutors Studio, and as a lecturer whose netlify.toml runs tutors-create validate
  I want every Tutors library the release carries to be on JSR at the version in its deno.json
  So that nothing has to copy course-rules, and a pinned jsr: import resolves

  Issue #602 (M5 of #599). .github/workflows/jsr-publish.yml runs on a published vX.Y.Z release and publishes
  what scripts/release/jsr-publish.mjs plans, with OIDC and provenance.

  @rule-0775 @ears-event-driven
  Rule: When a Tutors release is published, tutors shall publish to JSR every library whose deno.json version JSR does not serve, each after the Tutors libraries it imports.

    Scenario: Only the versions JSR lacks are published, dependencies first
      Given the libraries in the repository
      And JSR serves every version except "@tutors/course-rules@0.1.0" and "@tutors/tutors-create@5.4.0"
      When the publish is planned
      Then the plan is "packages/jsr/course-rules, packages/jsr/create"

    Scenario: A library is published after every library it imports
      Given the libraries in the repository
      And JSR serves none of them
      When the publish is planned
      Then every library comes after each Tutors library it imports
      And "packages/jsr/model" comes first

    Scenario: Nothing is published when JSR has every version
      Given the libraries in the repository
      And JSR serves every version
      When the publish is planned
      Then the plan is empty
