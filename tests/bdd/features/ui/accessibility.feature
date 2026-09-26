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

  @rule-0170 @ears-ubiquitous
  Rule: The reader shall give every named landmark on a page an accessible name that no other landmark on that page has.

    Scenario: Lab page landmarks have distinct names on a desktop
      When a student opens a lab step in a window 1440 pixels wide
      Then no two landmarks on the page share an accessible name
      And the course navigation holds the list of steps named "Steps"
      And the pager is a navigation landmark named "Previous and next step"

    Scenario: Lab page landmarks have distinct names on a phone
      When a student opens a lab step in a window 390 pixels wide
      And the student expands the list of steps above the step
      Then no two landmarks on the page share an accessible name
      And the pager is a navigation landmark named "Previous and next step"

  @rule-0171 @ears-ubiquitous
  Rule: The reader shall show its site footer, with the Tutors version link, as a contentinfo landmark named "Site footer" outside the main landmark.

    Scenario: Course page footer is a landmark outside the main content
      When a student opens the Reference Course
      Then a contentinfo landmark named "Site footer" holds the Tutors version link
      And the main landmark does not hold the Tutors version link

  @rule-0172 @ears-event-driven
  Rule: When a student opens course search, the reader shall name the list of results "Search results", apart from the search dialog and the button that opened it.

    Scenario: Search result list is named apart from the dialog
      When a student opens search from the header of the Reference Course
      Then the dialog is named "Search this course"
      And its list of results is named "Search results"
