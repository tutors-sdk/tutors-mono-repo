@developer
Feature: EARS dashboard
  As a developer new to Tutors
  I want one page that shows every requirement, the format it is written in and what proves it
  So that I can read the Rules that exist and write a new one the way the audit expects

  The page is built by scripts/ears-dashboard.ts (pnpm ears:dashboard) from the EARS audit's own
  parser and checks, so it says what CI says. CI attaches it to every run of the EARS audit job.
  The scenarios build it from a small repository written by the steps: a student feature with
  Rule 0001 (event-driven, bound by a steps file) and Rule 0002 (ubiquitous), and a @ui feature
  with Rule 0003, proved by a Playwright test.

  @rule-0510 @ears-ubiquitous
  Rule: Tutors shall list every Rule under tests/bdd/features on the EARS dashboard with its id, its EARS pattern, its feature file and the titles of its scenarios.

    Scenario: Every Rule is listed with its pattern and scenarios
      Given the example repository
      When the EARS dashboard is built
      Then it lists Rules "0001, 0002, 0003"
      And Rule "0001" is "event-driven" in "tests/bdd/features/student/search.feature"
      And Rule "0001" has the scenario "A search lists the matching topics"

  @rule-0511 @ears-event-driven
  Rule: When a Rule has an EARS audit finding, tutors shall show the finding's code on that Rule on the EARS dashboard and say whether the audit baseline allows it.

    Scenario: A new finding marks its Rule as failing
      Given the example repository
      And Rule "0002" says "should" instead of "shall"
      When the EARS dashboard is built
      Then Rule "0002" fails the audit with "obligation-keyword"
      And Rule "0001" passes the audit

    Scenario: A finding the baseline lists is shown as allowed
      Given the example repository
      And a feature "tests/bdd/features/student/legacy.feature" with a scenario outside a Rule, listed in the audit baseline
      When the EARS dashboard is built
      Then the feature "tests/bdd/features/student/legacy.feature" shows "no-rule" as allowed by the baseline

  @rule-0512 @ears-ubiquitous
  Rule: Tutors shall name on the EARS dashboard what proves each Rule, naming the steps file that binds it or the Playwright test that proves each scenario of a @ui Rule.

    Scenario: A Rule names its steps file and a @ui Rule its Playwright test
      Given the example repository
      When the EARS dashboard is built
      Then Rule "0001" is proved by the steps file "tests/bdd/steps/student/search.steps.ts"
      And Rule "0003" is proved by the Playwright test "apps/reader/tests/e2e/cards.spec.ts" for "A card shows its title"

  @rule-0513 @ears-event-driven
  Rule: When the EARS dashboard is built since a git ref, tutors shall mark each Rule added or changed after that ref and list each Rule removed after it.

    Scenario: Rules added, changed and removed since a ref are marked
      Given the example repository committed and tagged "v1"
      And after "v1" Rule "0001" is reworded, Rule "0002" is deleted and Rule "0004" is added
      When the EARS dashboard is built since "v1"
      Then Rule "0001" is marked "changed"
      And Rule "0004" is marked "added"
      And Rule "0002" is listed as removed
      And Rule "0003" is not marked

  @rule-0514 @ears-ubiquitous
  Rule: Tutors shall show on the EARS dashboard, for each EARS pattern, the shortest Rule of that pattern that passes the audit as the example of that pattern.

    Scenario: Each pattern takes a passing Rule from the features as its example
      Given the example repository
      When the EARS dashboard is built
      Then the example of "event-driven" is Rule "0001"
      And the example of "ubiquitous" is Rule "0003"
      And the page shows the EARS template of every pattern

  @rule-0515 @ears-unwanted
  Rule: If a feature file contains the text </script>, then tutors shall embed it in the EARS dashboard page without closing the page's script element.

    Scenario: Feature text cannot end the page's script
      Given the example repository
      And Rule "0002" has a scenario step that says "</script><b>injected</b>"
      When the EARS dashboard page is rendered
      Then the page has exactly one "</script>"
      And the page's data still holds "</script><b>injected</b>"
