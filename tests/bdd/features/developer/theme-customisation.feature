@developer @ears-event-driven @ears-optional
Feature: Theme Customisation
  As a developer
  I want to configure themes and icon libraries for courses
  So that course appearances can be tailored to institutional branding

  @ears-event-driven
  Scenario: Switch between available themes
    When a developer selects a different theme from the layout menu
    Then the system shall apply the new theme's colour tokens
    And the UI shall update without a page reload

  @ears-optional
  Scenario: Select icon library
    Where the layout menu icon library option is available
    Then the system shall offer Fluent, Hero, Lucide, and LA icon libraries
    And switching libraries shall update all icons in the interface

  @ears-event-driven
  Scenario: Toggle light and dark colour scheme
    When a developer toggles the colour scheme
    Then the system shall switch between light and dark modes
    And the preference shall persist across sessions via cookie

  @ears-optional
  Scenario: Apply custom theme to a course
    Where a course has a custom theme defined in its properties
    Then the system shall apply the course-specific theme on load
    And the course theme shall override the user's global preference

  @ears-event-driven
  Scenario: Code syntax highlighting follows theme
    When a developer changes the code style setting
    Then fenced code blocks shall use the selected syntax theme
