@shared @ears-ubiquitous @ears-optional
Feature: Responsive Layout
  As any user on any device
  I want the interface to adapt to my screen size
  So that I can use the platform on mobile, tablet and desktop

  @ears-ubiquitous
  Scenario: Desktop layout shows sidebar
    Given the viewport width is 1280 pixels or wider
    Then the system shall display the sidebar navigation
    And course content shall occupy the remaining space

  @ears-ubiquitous
  Scenario: Mobile layout hides sidebar
    Given the viewport width is less than 768 pixels
    Then the system shall collapse the sidebar
    And the system shall provide a hamburger menu to toggle it

  @ears-ubiquitous
  Scenario: Course cards reflow on narrow screens
    Given the viewport width changes from desktop to mobile
    Then course cards shall reflow from a grid to a single column

  @ears-optional
  Scenario: Touch-friendly interaction targets
    Where the device supports touch input
    Then interactive elements shall have a minimum touch target size
    And swipe gestures shall be supported for lab step navigation
