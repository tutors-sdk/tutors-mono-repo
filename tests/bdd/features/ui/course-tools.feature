@ui @reader
Feature: Course tools
  As a student or an author
  I want the course tree, calendar, tour, creator and presence tools to work from any page
  So that I can find my way around a course and build new ones

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0040 @ears-event-driven
  Rule: When a student follows a link in the course tree, the reader shall open that page and mark it as the only current page in the tree.

    Scenario: Course tree opens a page and marks it current
      When a student expands the course tree and follows "Mermaid Diagrams"
      Then the tree closes, the note opens, and reopening the tree marks only that link as current

  @rule-0041 @ears-ubiquitous
  Rule: The reader shall align the course tree's counts and chevrons in one column whether its branches are open or closed.

    Scenario: Course tree counts stay aligned when a branch opens
      When a student opens a branch of the course tree
      Then every count and chevron keeps the same horizontal position and is centred on its title

  @rule-0042 @ears-event-driven
  Rule: When a student filters the course calendar to assessments, the reader shall list only the weeks with assessments.

    Scenario: Calendar filters to assessment weeks
      When a student opens the course calendar and shows assessments
      Then 3 of the 16 weeks are listed

  @rule-0043 @ears-event-driven
  Rule: When a student selects "This week" in the course calendar, the reader shall list every week and move focus to the current week.

    Scenario: This week focuses the current week
      When a student selects "This week" in the course calendar
      Then all 16 weeks are listed and the current week has focus

  @rule-0044 @ears-event-driven
  Rule: When the guided tour reaches the Course Tree step, the reader shall place the tour beside the visible course tree control without covering it.

    Scenario: Tour points at the visible course tree control
      When a student starts the tour and moves to the Course Tree step
      Then the tour sits 12 pixels to the right of the visible control, inside the viewport
      And Tab keeps focus inside the tour

  @rule-0045 @ears-event-driven
  Rule: When an author completes the course creator, the reader shall download the course as a zip named after the course.

    Scenario: Course creator downloads the new course
      When an author names a course "UI test course", sets its units and generates it
      Then the preview shows course.md with the name and the download is "ui-test-course.zip"

  @rule-0046 @ears-event-driven
  Rule: When a signed-in student opens the online list from the account menu, the reader shall close the menu and show the online students in a dialog.

    Scenario: Online list opens as a dialog
      Given a signed-in student sees one student online
      When the student opens "View 1 Online" from the account menu
      Then the menu closes and a dialog lists the online student in a card narrower than 60 percent of its grid
