@developer @ears-event-driven @ears-optional
Feature: Theme Customisation
  As a developer
  I want to configure themes and icon libraries for courses
  So that course appearances can be tailored to institutional branding

  @ears-event-driven
  Scenario: Switch between available themes
    Given the theme service has started with no stored preferences
    When a developer selects the theme "classic"
    Then the current theme shall be "classic"
    And the document shall carry the theme attribute "classic"
    And the stored theme preference shall be "classic"
    When a developer then selects the unknown theme "crimson"
    Then the current theme shall fall back to "tutors"
    And the document theme attribute shall fall back to "tutors"

  @ears-optional
  Scenario: Select icon library
    Given the theme service has started with no stored preferences
    Then the "course" icon shall be "fluent:notebook-24-filled"
    When a developer selects the theme "easter"
    Then the "course" icon shall change to "mdi:easter"
    And an icon type no library defines shall fall back to "fa-solid:chalkboard-teacher"

  @ears-event-driven
  Scenario: Toggle light and dark colour scheme
    Given the theme service has started with no stored preferences
    When a developer toggles the colour scheme
    Then the display mode shall be "dark"
    And the document shall have the "dark" class and the colour scheme "dark"
    When the application starts again in a later session
    Then the display mode shall still be "dark"
    When a developer toggles the colour scheme again
    Then the display mode shall return to "light"
    And the document shall not have the "dark" class

  @ears-event-driven
  Scenario: Code syntax highlighting follows theme
    Given a syntax highlighter is registered with the markdown renderer
    When a fenced "typescript" code block is rendered with the code style "monokai"
    Then the highlighter shall be asked for the language "typescript" in the theme "monokai"
    And the rendered HTML shall contain the highlighter's output
