@instructor
Feature: Validating a course in GitHub Actions
  As an instructor who keeps a course in a GitHub repository
  I want every push and pull request checked by tutors validate
  So that a broken course never reaches my students, and each problem is shown where I changed it

  The action is .github/actions/tutors-validate/action.yml, a composite action that runs
  `jsr:@tutors/tutors-create validate`. These scenarios run its own shell steps with a stand-in deno, so
  they check the script GitHub runs, not a copy of it.

  @rule-0723 @ears-event-driven
  Rule: When the tutors validate action runs on a course, tutors shall print the findings to the job log, write them as SARIF for code scanning, and fail the job with tutors validate's exit status.

    Scenario: A course with errors fails the job and its findings are uploaded
      Given tutors validate will exit 1
      When the action runs on "courses/web" with strict "false"
      Then deno shall have run "jsr:@tutors/tutors-create@5 validate courses/web" and then the same with "--format sarif"
      And the action shall upload the SARIF file
      And the job shall fail with status 1

    Scenario: Strict checking is passed on
      Given tutors validate will exit 2
      When the action runs on "." with strict "true"
      Then deno shall have run "jsr:@tutors/tutors-create@5 validate . --strict" and then the same with "--format sarif"
      And the job shall fail with status 2

    Scenario: A clean course passes
      Given tutors validate will exit 0
      When the action runs on "." with strict "false"
      Then the job shall pass

    Scenario: A folder that cannot be read uploads nothing
      Given tutors validate will exit 3
      When the action runs on "missing" with strict "false"
      Then the action shall not upload a SARIF file
      And the job shall fail with status 3

    Scenario: A version that is not a version never reaches deno
      Given tutors validate will exit 0
      When the action runs with version "5; curl evil.example"
      Then deno shall not have run
      And the job shall fail with status 3

    Scenario: Every step it uses is pinned and every input reaches a script through the environment
      Given the action's definition
      Then each action it uses shall be pinned to a full commit SHA
      And no run script shall interpolate an expression
