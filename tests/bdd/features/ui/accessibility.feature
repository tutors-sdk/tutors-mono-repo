@ui @reader
Feature: Accessibility
  As a student who uses assistive technology
  I want every reader page to meet WCAG 2.1 AA
  So that I can use Tutors on equal terms

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0051 @ears-ubiquitous
  Rule: The reader shall show course pages with no critical or serious WCAG 2.1 AA violations in either appearance.

    Scenario: Course page has no serious violations in light appearance
      When axe audits the Reference Course in Light
      Then it reports no critical or serious violation

    Scenario: Course page has no serious violations in dark appearance
      When axe audits the Reference Course in Dark
      Then it reports no critical or serious violation

    Scenario: Note in the Dyslexia theme has no serious violations
      When axe audits a note in the Dyslexia theme
      Then it reports no critical or serious violation
