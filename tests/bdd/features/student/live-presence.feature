@student @ears-event-driven @ears-unwanted
Feature: Live Presence
  As a student
  I want to see who is currently online in my course
  So that I can feel connected to my learning community

  @ears-event-driven
  Scenario: See online students count
    When a student opens the live view for a course
    Then the system shall display the number of students currently online

  @ears-event-driven
  Scenario: Receive real-time presence updates
    Given a student is viewing the live page
    When another student joins the course
    Then the system shall update the online count in real time
    And the new student shall appear in the online list

  @ears-event-driven
  Scenario: Student leaves course presence
    Given 3 students are online in a course
    When one student closes their browser
    Then the system shall remove them from the online list
    And the online count shall decrease to 2

  @ears-unwanted
  Scenario: Handle presence connection failure
    If the WebSocket connection to the presence server fails
    Then the system shall not crash
    And the system shall indicate that live presence is unavailable

  @ears-event-driven
  Scenario: Express sentiment
    When a student sets their sentiment to a specific value
    Then the system shall broadcast the sentiment to other course participants
    And the sentiment shall be visible on the student's presence card

  @ears-unwanted
  Scenario: Private mode hides presence
    If a student has disabled share presence
    Then the system shall not broadcast their activity to others
    And their name shall not appear in the online list
