Feature: Presence Tracking
  As an instructor
  I want to see which students are currently active
  So that I can monitor engagement in real time

  Scenario: Display courses with active students
    Given 3 students are online across 2 courses
    When I view the live dashboard
    Then I should see 2 course cards
    And each card should show the number of active students

  Scenario: Display individual student on a course
    Given a student "Alice" is active on "web-dev-101"
    When I view the course detail for "web-dev-101"
    Then I should see "Alice" in the active students list
    And I should see their avatar

  Scenario: Handle student disconnect
    Given a student "Alice" is active on "web-dev-101"
    When "Alice" disconnects from the WebSocket
    Then "Alice" should be removed from the active students list
    And the active count for "web-dev-101" should decrease by 1

  Scenario: Group students by course
    Given 5 students are online across 3 courses
    When I view the live dashboard
    Then students should be grouped by their current course
    And each group should show the correct student count
