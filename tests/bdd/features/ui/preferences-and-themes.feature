@ui @reader
Feature: Preferences and themes
  As a student
  I want to choose how the reader looks
  So that it is comfortable and readable for me

  Each scenario is proved by the Playwright test with the same title, tagged with the Rule id,
  in apps/reader/tests/e2e. `pnpm test:ears:audit` fails if a scenario has no such test.

  @rule-0037 @ears-ubiquitous
  Rule: The reader shall offer theme, appearance, density and language choices in a Preferences menu drawn above every other page element.

    Scenario: Preferences menu offers its choices above the page
      When a student opens Preferences
      Then it offers 7 themes, Light and Dark, 2 densities and 6 languages, and no card style
      And on a phone its first row is not covered by the header

  @rule-0038 @ears-event-driven
  Rule: When a student chooses a theme and an appearance, the reader shall apply them with body and label text contrast of at least 4.5 to 1.

    Scenario: Every theme is readable in both appearances
      When a student chooses each theme in Light and in Dark
      Then body text and preference labels have contrast of at least 4.5 to 1
      And the menu stays attached below the header

  @rule-0039 @ears-event-driven
  Rule: When a student reloads the reader, the reader shall keep the theme the student chose.

    Scenario: Dyslexia theme survives a reload
      Given a student has chosen the Dyslexia theme
      When the student reloads a note
      Then the page uses OpenDyslexic at 20 pixels with 37 pixel lines
