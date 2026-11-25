Feature: Theming
  As a user
  I want to customise the visual appearance of the platform
  So that I can use it comfortably in different environments

  @rule-0536 @ears-event-driven
  Rule: When a user turns on dark mode, tutors shall show the interface in dark mode and store the mode preference as dark.

    Scenario: Switch between light and dark mode
      Given I am viewing a course in light mode
      When I toggle the dark mode switch
      Then the interface should switch to "dark" mode
      And the stored "modeCurrent" preference should be "dark"

  @rule-0537 @ears-event-driven
  Rule: When a user selects one of the 7 themes, tutors shall set it on the document and store it as the theme preference.

    Scenario: Apply a Skeleton theme
      Given the platform offers the themes "tutors, classic, dyslexia, terminus, rose, cerberus, easter"
      When I select the "rose" theme
      Then the document theme attribute should be "rose"
      And the stored "theme" preference should be "rose"

  @rule-0538 @ears-event-driven
  Rule: When a user selects the dyslexia theme, tutors shall set the OpenDyslexic font and start later sessions with that theme.

    Scenario: Enable dyslexia-friendly font
      Given I am viewing a course in light mode
      When I select the "dyslexia" theme
      Then the document theme attribute should be "dyslexia"
      And the "dyslexia" stylesheet should set the base font family to "OpenDyslexic, sans-serif"
      And a later session should start with the "dyslexia" theme
