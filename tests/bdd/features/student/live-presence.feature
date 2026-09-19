@student @ears-event-driven @ears-unwanted
Feature: Live Presence
  As a student
  I want to see who is currently online in my course
  So that I can feel connected to my learning community

  Background:
    Given the course "web-dev-101" is published with 2 labs
    And the student "Alice" is signed in

  @ears-event-driven
  Scenario: See online students count
    Given "Alice" has opened lab 1 of the course
    When "Bob" and "Carol" view lab 1 of the course
    Then the system shall display 3 students currently online

  @ears-event-driven
  Scenario: Receive real-time presence updates
    Given "Alice" has opened lab 1 of the course
    When another student "Bob" joins the course at lab 1
    Then the system shall update the online count to 2
    And the online list shall be "Alice, Bob"
    And when "Bob" moves on to lab 2 the online count shall stay at 2 and show "Bob" at "Lab 2"

  @ears-event-driven
  Scenario: Express sentiment
    Given "Alice" has opened lab 1 of the course
    When the student sets their sentiment to "confused"
    And the student moves on to lab 2
    Then the system shall store the sentiment "confused" for "alice"
    And the system shall broadcast the sentiment "confused" to other course participants
    And the sentiment "confused" shall be on the presence card of "Alice"

  @ears-unwanted
  Scenario: Private mode hides presence
    Given the student has disabled share presence
    When "Alice" opens lab 1 of the course
    Then the system shall mark "alice" as "offline"
    And the system shall not broadcast their activity to others
    And their name shall not appear in the online list
