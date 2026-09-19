@instructor @ears-state-driven @ears-unwanted
Feature: Student Engagement Monitoring
  As an instructor
  I want to monitor real-time and historical student engagement
  So that I can intervene when students are struggling

  Background:
    Given the course "web-dev-101" is published with 2 labs

  @ears-state-driven
  Scenario: View currently online students
    Given the instructor is viewing the live dashboard
    When the students "Alice, Bob" connect to the course via presence
    Then the system shall display a count of 2 online students
    And the system shall list student names and avatars:
      | name  | avatar                              |
      | Alice | https://avatars.example/alice.png   |
      | Bob   | https://avatars.example/bob.png     |

  @ears-state-driven
  Scenario: View latest activity feed
    Given "Alice" accessed lab 1 of the course at "2026-03-18T10:00:00.000Z"
    And "Bob" accessed lab 2 of the course at "2026-03-18T10:05:00.000Z"
    When the instructor loads the latest activity for the course
    Then the system shall show a feed of latest activity, most recent first
    And each entry shall include the student name, learning object, and timestamp:
      | student | learning object | timestamp                |
      | Bob     | Lab 2           | 2026-03-18T10:05:00.000Z |
      | Alice   | Lab 1           | 2026-03-18T10:00:00.000Z |

  @ears-state-driven
  Scenario Outline: Filter engagement by time period
    Given the live activity feed is viewed at "2026-03-18T12:00:00"
    When an activity was received at "<received>"
    Then the system shall place it in today "<today>", this week "<week>", this month "<month>" and this year "<year>"

    Examples:
      | received            | today | week | month | year |
      | 2026-03-18T09:00:00 | yes   | yes  | yes   | yes  |
      | 2026-03-16T09:00:00 | no    | yes  | yes   | yes  |
      | 2026-03-02T09:00:00 | no    | no   | yes   | yes  |
      | 2026-01-10T09:00:00 | no    | no   | no    | yes  |
      | 2025-12-31T09:00:00 | no    | no   | no    | no   |
