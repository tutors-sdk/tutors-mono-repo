@ui @reader
Feature: Reading labs and notes
  As a student
  I want lab and note text at a width I choose
  So that I can read comfortably on any screen

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0033 @ears-optional
  Rule: Where a student has chosen full width, the reader shall let lab and note text fill the reading panel.

    @active
    Scenario: Full width lets lab text fill the panel
      Given a student reads a lab at 1440 pixels
      When the student chooses "Full width"
      Then the lab text is wider than 1000 pixels

    @inactive
    Scenario: Standard width keeps lab text to a reading measure
      Given a student reads a lab at 1440 pixels
      When the student chooses "Standard"
      Then the reading panel spans the content column and the text is between 720 and 1000 pixels wide

  @rule-0034 @ears-event-driven
  Rule: When a student reloads the reader, the reader shall keep the content width the student chose.

    Scenario: Full width survives a reload
      Given a student has chosen "Full width" on a lab
      When the student reloads the page
      Then "Full width" is still the chosen content width

  @rule-0035 @ears-event-driven
  Rule: When a student moves between lab steps by the pager, the step list, the arrow keys or browser history, the reader shall mark only the current step in the step list.

    Scenario: Step list follows the pager, links, keys and history
      When a student moves through a lab with "Next", a step link, the right arrow key and Back
      Then the step list marks the step shown each time
      And on a phone the course navigation dialog marks the same step

  @rule-0036 @ears-ubiquitous
  Rule: The reader shall show a note's table of contents collapsed under "On this page" and give each code block a "Copy code" button.

    Scenario: Note contents start collapsed and code can be copied
      When a student opens a note with headings and code
      Then "On this page" is closed until the student opens it
      And the first code block has a button named "Copy code"
