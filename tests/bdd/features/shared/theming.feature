Feature: Theming
  As a user
  I want to customise the visual appearance of the platform
  So that I can use it comfortably in different environments

  Scenario: Switch between light and dark mode
    Given I am viewing a course in light mode
    When I toggle the dark mode switch
    Then the interface should switch to dark mode
    And the preference should be persisted

  Scenario: Apply a Skeleton theme
    Given the platform supports multiple Skeleton themes
    When I select the "crimson" theme
    Then the colour scheme should update to the crimson palette
    And all components should reflect the new theme

  Scenario: Enable dyslexia-friendly font
    Given I am viewing course content
    When I enable the dyslexia-friendly font option
    Then all text should render in the OpenDyslexic font family
    And the preference should be persisted across sessions

  Scenario: Toggle card layout preference
    Given I am viewing a topic with multiple learning objects
    When I switch between compact and expanded card layouts
    Then the cards should re-render in the selected layout
    And the layout preference should be persisted
