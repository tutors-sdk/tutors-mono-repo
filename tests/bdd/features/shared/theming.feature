Feature: Theming
  As a user
  I want to customise the visual appearance of the platform
  So that I can use it comfortably in different environments

  Scenario: Switch between light and dark mode
    Given I am viewing a course in light mode
    When I toggle the dark mode switch
    Then the interface should switch to "dark" mode
    And the stored "modeCurrent" preference should be "dark"

  Scenario: Apply a Skeleton theme
    Given the platform offers the themes "tutors, classic, dyslexia, terminus, rose, cerberus, easter"
    When I select the "rose" theme
    Then the document theme attribute should be "rose"
    And the stored "theme" preference should be "rose"

  Scenario: Enable dyslexia-friendly font
    Given I am viewing a course in light mode
    When I select the "dyslexia" theme
    Then the document theme attribute should be "dyslexia"
    And the "dyslexia" stylesheet should set the base font family to "OpenDyslexic, sans-serif"
    And a later session should start with the "dyslexia" theme

  Scenario: Toggle card layout preference
    Given I am viewing a course in light mode
    When I toggle the card layout
    Then the card layout should be "compacted"
    And the stored "layout" preference should be "compacted"
    And a later session should start with the "compacted" card layout
