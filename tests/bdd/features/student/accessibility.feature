@student @ears-ubiquitous @ears-optional
Feature: Accessibility
  As a student with accessibility needs
  I want the platform to be navigable by keyboard and screen reader
  So that I can access all learning content regardless of ability

  @ears-ubiquitous
  Scenario: Skip to content link
    Given a student navigates to any page
    Then the system shall provide a "Skip to content" link as the first focusable element

  @ears-ubiquitous
  Scenario: Semantic navigation landmarks
    Given a student is viewing a course page
    Then the system shall provide labelled navigation landmarks
    And landmarks shall include main navigation, breadcrumbs, sidebar, and footer

  @ears-ubiquitous
  Scenario: Keyboard navigation through course content
    Given a student is navigating by keyboard
    Then all interactive elements shall be reachable via Tab key
    And the current focus shall be visually indicated

  @ears-optional
  Scenario: High contrast theme support
    Where the student has selected a high contrast theme
    Then the system shall apply sufficient contrast ratios to all text
    And interactive elements shall have visible focus indicators

  @ears-ubiquitous
  Scenario: Images have alternative text
    Given a course contains learning objects with images
    Then each image shall have descriptive alt text
    And decorative images shall have empty alt attributes
