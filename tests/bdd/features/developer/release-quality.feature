@developer
Feature: Release quality record
  As the captain of a Tutors release
  I want one quality record per commit with the mutation score of every package and the result of every nightly job
  So that the release harness can mark a candidate's tests from the nightly evidence instead of from step summaries

  The command is scripts/checks/release-quality.ts (pnpm release:quality). It reads the nightly Stryker report that
  scripts/checks/mutation-floors.ts checks, and writes quality.json in the shape the release harness reads with
  --test-signal: packages [{ name, mutationScore, changed }]. The nightly job results are extra fields the harness
  ignores. The last nightly job publishes the record to the quality branch.

  @rule-0221 @ears-event-driven
  Rule: When a maintainer asks for the quality record of a commit, tutors shall write each package's mutation score over the mutants of every module in that package.

    Scenario: Two modules of one package score as one package
      Given the nightly Stryker report kills 9 and misses 1 of the mutants in "packages/jsr/model/src/utils/lo-utils.ts"
      And the nightly Stryker report kills 1 and misses 9 of the mutants in "packages/jsr/model/src/services/search.ts"
      And the nightly Stryker report also kills 3 and misses 1 of the mutants in "packages/svelte/course/src/course/services/course.svelte.ts"
      When the maintainer asks for the quality record
      Then the quality record shall give "@tutors/tutors-model-lib" a mutation score of 50
      And the quality record shall give "@tutors/course" a mutation score of 75

    Scenario: The record is one the release harness reads as a test signal
      Given the nightly Stryker report kills 9 and misses 1 of the mutants in "packages/jsr/model/src/utils/lo-utils.ts"
      When the maintainer asks for the quality record
      Then every package in the quality record shall have a name, a mutation score from 0 to 100 and a changed flag

  @rule-0222 @ears-event-driven
  Rule: When the quality record is written, tutors shall mark a package as changed only when a file under that package's directory differs between the commit and the base, which is the production commit in release/deployed.json unless the maintainer names another.

    Scenario: A package with a changed file is changed and the others are not
      Given the nightly Stryker report kills 9 and misses 1 of the mutants in "packages/jsr/model/src/utils/lo-utils.ts"
      And the nightly Stryker report kills 3 and misses 1 of the mutants in "packages/svelte/course/src/course/services/course.svelte.ts"
      And the files "packages/jsr/model/src/utils/lo-utils.ts, apps/reader/src/app.html" differ from the base
      When the maintainer asks for the quality record
      Then the quality record shall mark "@tutors/tutors-model-lib" as changed
      And the quality record shall mark "@tutors/course" as not changed

    Scenario: Without a named base the record compares with production
      Given release/deployed.json names the production commit "caa53d021e63004ad6e52a76428f8acd95a87c21"
      When the maintainer asks for the quality record without naming a base
      Then the quality record shall compare with "caa53d021e63004ad6e52a76428f8acd95a87c21"

    Scenario: A named base wins over production
      Given release/deployed.json names the production commit "caa53d021e63004ad6e52a76428f8acd95a87c21"
      When the maintainer asks for the quality record since "v16.2.1"
      Then the quality record shall compare with "v16.2.1"

  @rule-0223 @ears-unwanted
  Rule: If no base is named and release/deployed.json names no production commit, then tutors shall mark every package in the quality record as changed.

    Scenario: With nothing to compare with, every package counts
      Given the nightly Stryker report kills 9 and misses 1 of the mutants in "packages/jsr/model/src/utils/lo-utils.ts"
      And the nightly Stryker report kills 3 and misses 1 of the mutants in "packages/svelte/course/src/course/services/course.svelte.ts"
      And release/deployed.json is absent
      When the maintainer asks for the quality record without naming a base
      Then the quality record shall mark "@tutors/tutors-model-lib" as changed
      And the quality record shall mark "@tutors/course" as changed

  @rule-0224 @ears-event-driven
  Rule: When the nightly workflow finishes, tutors shall publish the nightly commit's quality record with the result of every other nightly job to the quality branch as quality/<sha>.json and quality/latest.json, including on a night a job failed.

    Scenario: The record carries each nightly job's result
      Given the nightly Stryker report kills 9 and misses 1 of the mutants in "packages/jsr/model/src/utils/lo-utils.ts"
      And the nightly jobs ended "mutation-nightly=success, lighthouse=failure, load=skipped"
      When the maintainer asks for the quality record
      Then the quality record shall list the nightly job "lighthouse" as "failure"
      And the quality record shall list the nightly job "load" as "skipped"
      And the quality record shall give the night the result "failure"

    Scenario: The last nightly job publishes the record whatever the other jobs did
      Given the nightly workflow
      Then its quality job shall wait for every other test job and run even when one failed
      And its quality job shall run "pnpm release:quality" and push "quality/${GITHUB_SHA}.json" and "quality/latest.json" to the "quality" branch
      And only its quality job shall be allowed to write the repository's contents

  @rule-0225 @ears-unwanted
  Rule: If the nightly Stryker report is absent, then tutors shall write the quality record with the nightly job results and no package mutation scores.

    Scenario: A night whose mutation run wrote no report still records its jobs
      Given there is no nightly Stryker report
      And the nightly jobs ended "mutation-nightly=failure, suite-health=success"
      When the maintainer asks for the quality record
      Then the quality record shall have no package mutation scores
      And the quality record shall list the nightly job "mutation-nightly" as "failure"
