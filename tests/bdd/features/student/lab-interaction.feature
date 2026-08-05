@student @ears-event-driven @ears-state-driven
Feature: Lab Interaction
  As a student
  I want to navigate through lab steps and view content
  So that I can complete hands-on exercises progressively

  @ears-event-driven
  Scenario: Navigate through lab steps
    Given a lab has 5 steps
    When a student opens the lab
    Then the system shall display the first step
    And the system shall show a navigation panel with all step titles

  @ears-event-driven
  Scenario: Move between lab steps
    Given a student is on step 2 of a 5-step lab
    When the student clicks on step 4
    Then the system shall display the content for step 4
    And the step navigation shall highlight step 4 as active

  @ears-state-driven
  Scenario: View lab with mixed content types
    While a lab step contains markdown with fenced code blocks
    Then the system shall render markdown as HTML
    And the system shall syntax-highlight code blocks with the correct language

  @ears-event-driven
  Scenario: Navigate via breadcrumbs
    Given a student is viewing a lab within a topic
    When the student clicks the topic breadcrumb
    Then the system shall navigate back to the topic view

  @ears-state-driven
  Scenario: View lab PDF companion
    While a lab has an associated PDF file
    Then the system shall provide a link to download or view the PDF
