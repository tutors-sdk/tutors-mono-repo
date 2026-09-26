@developer
Feature: Test quality ratchets
  As a maintainer of Tutors
  I want coverage and mutation scores measured honestly and held by floors that only rise
  So that a change cannot quietly make the test suite weaker

  The floors live in tests/suite-health/coverage-floors.json and tests/mutation/mutation-floors.json.
  The checks are scripts/checks/coverage-floors.ts and scripts/checks/mutation-floors.ts.

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
  Rule: When the nightly workflow runs, tutors shall run mutation testing and fail the nightly run if the mutation score is below the break threshold of 85 percent.

    Scenario: The nightly workflow runs mutation testing and its failure fails the night
      Given the nightly workflow
      Then it shall have a job that runs "pnpm test:mutation"
      And the job that reports the night shall fail when the mutation job fails

    Scenario: Stryker breaks below 85 percent
      Given the Stryker configuration
      Then its break threshold shall be at least 85
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
