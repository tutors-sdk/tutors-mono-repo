@student
Feature: Live Presence
  As a student
  I want to see who is currently online in my course
  So that I can feel connected to my learning community

  Background:
    Given the course "web-dev-101" is published with 2 labs
    And the student "Alice" is signed in
    And a live dashboard is watching the course and the platform feeds

  @rule-0539 @ears-event-driven
  Rule: When students open a course, the reader shall show the number of students online on it.

    Scenario: See online students count
      Given "Alice" has opened lab 1 of the course
      When "Bob" and "Carol" view lab 1 of the course
      Then the system shall display 3 students currently online

  @rule-0540 @ears-event-driven
  Rule: When another student joins a course or moves within it, the reader shall update the online list, the count and the learning object shown for that student.

    Scenario: Receive presence updates
      Given "Alice" has opened lab 1 of the course
      When another student "Bob" joins the course at lab 1
      Then the system shall update the online count to 2
      And the online list shall be "Alice, Bob"
      And when "Bob" moves on to lab 2 the online count shall stay at 2 and show "Bob" at "Lab 2"

  @rule-0541 @ears-event-driven
  Rule: When a student sets their sentiment, the reader shall store it and broadcast it to the other participants of the course.

    Scenario: Express sentiment
      Given "Alice" has opened lab 1 of the course
      When the student sets their sentiment to "confused"
      And the student moves on to lab 2
      Then the system shall store the sentiment "confused" for "alice"
      And the system shall broadcast the sentiment "confused" to other course participants
      And the sentiment "confused" shall be on the presence card of "Alice"

  @rule-0542 @ears-unwanted
  Rule: If a student has turned off sharing their presence, then the reader shall mark the student offline and broadcast none of their activity.

    Scenario: Private mode hides presence
      Given the student has disabled share presence
      When "Alice" opens lab 1 of the course
      Then the system shall mark "alice" as "offline"
      And the system shall not broadcast their activity to others
      And their name shall not appear in the online list

  @rule-0271 @ears-unwanted
  Rule: If a learning event is published for a course the student is not reading, then the reader shall not receive it.

    Scenario: Events from another course never reach the reader
      Given "Alice" has opened lab 1 of the course
      When a learning event for the course "databases-101" is published platform-wide
      Then the online list shall be "Alice"
      And the reader shall hold no joined platform-wide channel

    Scenario: The reader still publishes platform-wide for the live dashboard
      Given "Alice" has opened lab 1 of the course
      Then the platform-wide channel shall carry 1 event for "Alice"
