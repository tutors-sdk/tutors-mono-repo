@developer
Feature: Test quality ratchets
  As a maintainer of Tutors
  I want coverage and mutation scores measured honestly and held by floors that only rise
  So that a change cannot quietly make the test suite weaker

  The floors live in tests/suite-health/coverage-floors.json, tests/mutation/mutation-floors.json and
  tests/mutation/nightly-mutation-floors.json. The checks are scripts/checks/coverage-floors.ts and
  scripts/checks/mutation-floors.ts.

  @rule-0110 @ears-ubiquitous
  Rule: Tutors shall measure test coverage over every TypeScript source file under the packages and app source directories, including files that no test imports.

    Scenario: A module no test imports is inside the coverage measure
      Given the repository's coverage configuration
      Then the scaffolder source file "packages/jsr/create/src/generate.ts" shall be measured
      And the time dashboard source file "apps/time/src/lib/enrichCourseUserFields.ts" shall be measured
      And the course package source file "packages/svelte/course/src/course/services/lo-tree.ts" shall be measured

    Scenario: Test files and generated files stay out of the measure
      Given the repository's coverage configuration
      Then the test file "packages/svelte/course/src/course/services/__tests__/lo-tree.test.ts" shall not be measured
      And the generated file "apps/reader/.svelte-kit/types/src/routes/proxy+layout.ts" shall not be measured
      And the declaration file "packages/jsr/model/src/types/ambient.d.ts" shall not be measured

  @rule-0111 @ears-unwanted
  Rule: If total or per-package test coverage falls below its recorded floor, then tutors shall fail the coverage check and name the scope and metric.

    Scenario: A package below its floor fails the check
      Given recorded coverage floors where "packages/jsr/model/src/**" holds statements at 83 percent
      When the measured statement coverage of "packages/jsr/model/src" is 82.9 percent
      Then the coverage check shall report "below-floor: packages/jsr/model/src/** statements 82.9% < floor 83%"

    Scenario: The total below its floor fails the check
      Given recorded coverage floors where the total holds lines at 56 percent
      When the measured total line coverage is 55.5 percent
      Then the coverage check shall report "below-floor: total lines 55.5% < floor 56%"

    Scenario: The coverage run enforces the recorded floors
      Given the repository's coverage configuration
      Then its coverage thresholds shall equal the recorded coverage floors

  @rule-0112 @ears-unwanted
  Rule: If measured test coverage is 2 or more points above its recorded floor, then tutors shall fail the coverage check until the floor is raised.

    Scenario: Coverage that rose past the margin demands a raised floor
      Given recorded coverage floors where "packages/jsr/model/src/**" holds statements at 83 percent
      When the measured statement coverage of "packages/jsr/model/src" is 85.4 percent
      Then the coverage check shall report "stale-floor: packages/jsr/model/src/** statements 85.4% >= floor 83% + 2; raise it to 85"

    Scenario: Coverage within the margin passes
      Given recorded coverage floors where "packages/jsr/model/src/**" holds statements at 83 percent
      When the measured statement coverage of "packages/jsr/model/src" is 84.9 percent
      Then the coverage check shall report nothing for "packages/jsr/model/src/**"

    Scenario: Updating the floors raises them and never lowers one
      Given recorded coverage floors where "packages/jsr/model/src/**" holds statements at 83 percent
      When the measured statement coverage of "packages/jsr/model/src" is 85.4 percent
      And the floors are updated from the measurement
      Then the statement floor of "packages/jsr/model/src/**" shall be 85
      When the measured statement coverage of "packages/jsr/model/src" later falls to 60 percent
      And the floors are updated again
      Then the statement floor of "packages/jsr/model/src/**" shall still be 85

  @rule-0113 @ears-event-driven
  Rule: When the nightly workflow runs, tutors shall run mutation testing and fail the nightly run if the mutation score is below the break threshold of 90 percent.

    Scenario: The nightly workflow runs mutation testing and its failure fails the night
      Given the nightly workflow
      Then it shall have a job that runs "pnpm test:mutation"
      And the job that reports the night shall fail when the mutation job fails

    Scenario: Stryker breaks below 90 percent
      Given the Stryker configuration
      Then its break threshold shall be at least 90
      And it shall write a JSON report

  @rule-0114 @ears-unwanted
  Rule: If a mutated module's mutation score is below its recorded floor, then tutors shall fail the mutation floor check and name the module.

    Scenario: A module below its floor fails the check
      Given a recorded mutation floor of 85 percent for "packages/jsr/model/src/utils/lo-utils.ts"
      When Stryker kills 84 and misses 16 of the mutants in "packages/jsr/model/src/utils/lo-utils.ts"
      Then the mutation floor check shall report "below-floor: packages/jsr/model/src/utils/lo-utils.ts 84% < floor 85%"

    Scenario: A module whose score rose past the margin demands a raised floor
      Given a recorded mutation floor of 85 percent for "packages/jsr/model/src/utils/lo-utils.ts"
      When Stryker kills 90 and misses 10 of the mutants in "packages/jsr/model/src/utils/lo-utils.ts"
      Then the mutation floor check shall report "stale-floor: packages/jsr/model/src/utils/lo-utils.ts 90% >= floor 85% + 2; raise it to 90"

    Scenario: A mutated module with no floor fails the check
      Given a recorded mutation floor of 85 percent for "packages/jsr/model/src/utils/lo-utils.ts"
      When Stryker kills 5 and misses 5 of the mutants in "packages/jsr/gen/src/utils/lr-utils.ts"
      Then the mutation floor check shall report "unfloored: packages/jsr/gen/src/utils/lr-utils.ts scored 50% and has no floor"

    Scenario: Every module Stryker mutates has a recorded floor
      Given the Stryker configuration
      Then every module it mutates shall have a recorded mutation floor

  @rule-0115 @ears-ubiquitous
  Rule: Tutors shall load the mutation test run with the same workspace aliases and setup files as the main test run, so every test file it lists can reach the modules it mutates.

    Scenario: The mutation run resolves the workspace the way the main run does
      Given the repository's coverage configuration
      And the mutation test configuration
      Then the mutation run shall resolve the same workspace aliases as the main run
      And the mutation run shall load the same setup files as the main run

    Scenario: Every library suite the mutation run lists is one the main run also collects
      Given the mutation test configuration
      Then every test file pattern it lists shall fall under the main run's test files

  @rule-0116 @ears-event-driven
  Rule: When the nightly workflow runs, tutors shall mutation-test every TypeScript source file under the packages source directories against the unit, BDD and contract suites.

    Scenario: The nightly workflow runs the comprehensive mutation run and its failure fails the night
      Given the nightly workflow
      Then it shall have a job that runs "pnpm test:mutation:nightly"
      And the job that reports the night shall fail when the mutation job fails

    Scenario: Every package source file the coverage run measures is mutated
      Given the nightly Stryker configuration
      Then every package source file the coverage run measures shall be mutated
      And the scaffolder source file "packages/jsr/create/src/scaffolder.ts" shall be mutated
      And the course service "packages/svelte/course/src/course/services/course.svelte.ts" shall be mutated

    Scenario: The comprehensive run collects the unit, BDD and contract suites
      Given the nightly mutation test configuration
      Then it shall collect the unit test "tests/unit/model/lo-utils.test.ts"
      And it shall collect the BDD steps "tests/bdd/steps/developer/test-quality-ratchets.steps.ts"
      And it shall collect the contract test "tests/contract/model-lib-api.test.ts"
      And the nightly run shall resolve the same workspace aliases and setup files as the main run

  @rule-0117 @ears-unwanted
  Rule: If a module's score in the nightly mutation run is below its nightly floor or the module has no nightly floor, then tutors shall fail the nightly run and name the module.

    Scenario: The nightly job checks every module against the nightly floors
      Given the nightly workflow
      Then the job that runs "pnpm test:mutation:nightly" shall check "reports/mutation-nightly/mutation.json" against "tests/mutation/nightly-mutation-floors.json"

    Scenario: A module below its nightly floor fails the night
      Given a recorded nightly mutation floor of 70 percent for "packages/svelte/course/src/course/services/course.svelte.ts"
      When the nightly run kills 69 and misses 31 of the mutants in "packages/svelte/course/src/course/services/course.svelte.ts"
      Then the nightly floor check shall fail with "below-floor: packages/svelte/course/src/course/services/course.svelte.ts 69% < floor 70%"

    Scenario: A new library module without a nightly floor fails the night
      Given a recorded nightly mutation floor of 70 percent for "packages/svelte/course/src/course/services/course.svelte.ts"
      When the nightly run kills 3 and misses 1 of the mutants in "packages/jsr/model/src/new-module.ts"
      Then the nightly floor check shall fail with "unfloored: packages/jsr/model/src/new-module.ts scored 75% and has no floor"

    Scenario: Every nightly floor names a package source file the nightly run mutates
      Given the nightly Stryker configuration
      Then every recorded nightly mutation floor shall name a package source file it mutates

  @rule-0118 @ears-unwanted
  Rule: If the nightly mutation run leaves any tracked file changed, then tutors shall fail the nightly run.

    Scenario: The nightly job proves the tree is clean after mutating in place
      Given the nightly workflow
      Then the job that runs "pnpm test:mutation:nightly" shall run "git diff --exit-code --stat" after it, even when it fails

    Scenario: Stryker rewrites only the files it mutates
      Given the nightly Stryker configuration
      Then it shall mutate the source files in place
      And it shall not add type-check suppressions to files it does not mutate

  @rule-0119 @ears-event-driven
  Rule: When a module's score in the nightly mutation run is 2 or more points above its nightly floor, tutors shall report the floor to raise in the nightly summary without failing the nightly run.

    Scenario: A module that rose past the margin is reported and the night passes
      Given a recorded nightly mutation floor of 70 percent for "packages/svelte/course/src/course/services/course.svelte.ts"
      When the nightly run kills 80 and misses 20 of the mutants in "packages/svelte/course/src/course/services/course.svelte.ts"
      Then the nightly summary shall report "stale-floor: packages/svelte/course/src/course/services/course.svelte.ts 80% >= floor 70% + 2; raise it to 80"
      And the nightly floor check shall pass

    Scenario: The nightly job warns on stale floors and writes the step summary
      Given the nightly workflow
      Then the job that runs "pnpm test:mutation:nightly" shall check floors with "--stale warn" and "--summary"
