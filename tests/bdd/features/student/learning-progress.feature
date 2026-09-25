@student @ears-state-driven @ears-event-driven
Feature: Learning Progress Tracking
  As a student
  I want to track my learning progress through courses
  So that I can monitor my engagement and identify areas needing attention

  Background:
    Given the course "web-dev-101" is published with 2 labs
    And the student "Alice" is signed in

  @ears-state-driven
  Scenario: View time spent on a course
    Given the calendar holds 150 thirty-second blocks of time active for "alice" on "2026-03-16" and 30 on "2026-03-17"
    When the time report for the course is loaded
    Then the system shall display 90 minutes of total time active for "alice"
    And time shall be displayed in hours and minutes as "1h 30"

  @ears-event-driven
  Scenario: Record learning activity
    When the student views lab 1 of the course 2 times
    And the student stays on that page for 60 seconds
    Then the system shall record 2 more blocks of time active against the lab and against the calendar for today
    And the system shall increment the page load count for the lab to 2

  @ears-state-driven
  Scenario: Resume from last accessed position
    Given the student has previously accessed the course
    When the dashboard loads the recently accessed courses of the student
    Then the system shall list "web-dev-101" among the recently accessed courses
    And the entry shall show today as the last accessed date

  @ears-event-driven
  Scenario: Star a favourite course
    Given the student has previously accessed the course
    When the student stars the course "web-dev-101"
    Then the system shall store "web-dev-101" as a favourite in the profile of the student
    And the home page shall load "web-dev-101" among the favourites of the student

  @ears-state-driven
  Scenario: View learning records per learning object
    Given the course "databases-101" is also published
    When the student views lab 1 of "web-dev-101" 3 times, lab 2 of "web-dev-101" 1 time and lab 1 of "databases-101" 2 times
    Then the system shall track page loads per learning object:
      | course        | lab | page loads |
      | web-dev-101   | 1   | 3          |
      | web-dev-101   | 2   | 1          |
      | databases-101 | 1   | 2          |
    And the records shall be grouped by course, 2 for "web-dev-101" and 1 for "databases-101"
