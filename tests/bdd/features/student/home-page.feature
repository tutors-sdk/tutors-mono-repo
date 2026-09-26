@student
Feature: Student home page
  As a student
  I want the home page to show how far I have got in each course and take me back to where I stopped
  So that I can pick up where I left off

  The learning objects a course publishes are the pages the reader opens for it: every learning
  object in its tutors.json except topics, units, sides, lab steps, the panels shown on a topic's
  page, and links out (web, github and archive). A learning record counts toward the learning object whose route it equals or sits
  beneath, so a lab step's record counts toward its lab. Progression measures learning objects
  opened, not mastered.

  Background:
    Given the course "web-dev-101" is published with 4 labs

  @rule-0076 @ears-event-driven
  Rule: When a signed-in student selects Continue on a course on the home page, the reader shall open the learning object the student last opened in that course.

    Scenario: Continue leads to the last lab opened
      Given "alice" is signed in
      And "alice" last opened lab 3 of "web-dev-101", after lab 1
      When the home page loads the progress of "alice"
      Then Continue on "web-dev-101" leads to lab 3 of "web-dev-101"

    Scenario: Continue leads to the lab step last opened
      Given "alice" is signed in
      And "alice" last opened the first step of lab 2 of "web-dev-101"
      When the home page loads the progress of "alice"
      Then Continue on "web-dev-101" leads to the first step of lab 2 of "web-dev-101"

  @rule-0077 @ears-state-driven
  Rule: While a signed-in student has learning records for a course, the reader shall show on the home page the number of that course's learning objects the student has opened out of the number the course publishes.

    @active
    Scenario: Progression counts the labs opened
      Given "alice" is signed in
      And "alice" has learning records for labs 1 and 2 of "web-dev-101" and for the first step of lab 2
      When the home page loads the progress of "alice"
      Then "web-dev-101" shows 2 of 4 learning objects opened

    @inactive
    Scenario: No learning records, nothing opened
      Given "alice" is signed in
      And "alice" has no learning records for "web-dev-101"
      When the home page loads the progress of "alice"
      Then "web-dev-101" shows 0 of 4 learning objects opened and no Continue

  @rule-0078 @ears-state-driven
  Rule: While no one is signed in, the reader shall show on the home page the courses stored in the browser without progression.

    @active
    Scenario: A visitor who is not signed in sees no progression
      Given nobody is signed in and the browser has visited "web-dev-101"
      When the home page loads
      Then "web-dev-101" is listed without progression
      And the reader asks the data API for nothing

    @inactive
    Scenario: A signed-in student sees progression
      Given "alice" is signed in
      And "alice" has learning records for labs 1 and 2 of "web-dev-101" and for the first step of lab 2
      When the home page loads the progress of "alice"
      Then "web-dev-101" shows 2 of 4 learning objects opened

  @rule-0079 @ears-unwanted
  Rule: If the reader's data API does not answer while a signed-in student's home page loads, then the reader shall show progression as unavailable instead of as a number.

    Scenario: The data API is down
      Given "alice" is signed in
      And the reader's data API is down
      When the home page loads the progress of "alice"
      Then progression is shown as unavailable

    Scenario: The course host is down
      Given "alice" is signed in
      And "alice" has opened "databases-101", whose host is down and has never been read
      When the home page loads the progress of "alice"
      Then "databases-101" shows its progression as unavailable
