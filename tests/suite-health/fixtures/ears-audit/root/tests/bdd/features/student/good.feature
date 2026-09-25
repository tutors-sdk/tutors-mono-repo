@student
Feature: Good rules
  As a student
  I want every pattern written well
  So that the audit has a passing example

  Background:
    Given the catalogue is empty

  @rule-0001 @ears-ubiquitous
  Rule: The catalogue shall list each course with its title.

    Scenario: A course is listed
      Then the catalogue lists "Web Development"

  @rule-0002 @ears-event-driven
  Rule: When a student searches by keyword, the reader shall list the matching learning objects.

    Scenario Outline: A keyword matches
      When a student searches for "<term>"
      Then the reader lists the learning objects matching "<term>"

      Examples:
        | term |
        | lab  |
        | note |

  @rule-0003 @ears-state-driven
  Rule: While a student is signed in, tutors shall record the student's activity.

    @active
    Scenario: Signed in
      Given a student is signed in
      Then activity is recorded

    @inactive
    Scenario: Not signed in
      Given a student is not signed in
      Then no activity is recorded

  @rule-0004 @ears-unwanted
  Rule: If the course host is unreachable, then the reader shall show a retry message.

    Scenario: Host unreachable
      When the course host is unreachable
      Then the reader shows a retry message

  @rule-0005 @ears-optional
  Rule: Where a course enables the calendar, the time dashboard shall show a calendar view.

    @active
    Scenario: Calendar enabled
      Given the course enables the calendar
      Then the time dashboard shows a calendar view

    @inactive
    Scenario: Calendar not enabled
      Given the course does not enable the calendar
      Then the time dashboard shows no calendar view
