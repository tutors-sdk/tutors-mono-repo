@instructor @ears-state-driven @ears-unwanted
Feature: Student Engagement Monitoring
  As an instructor
  I want to monitor real-time and historical student engagement
  So that I can intervene when students are struggling

  @ears-state-driven
  Scenario: View currently online students
    While students are connected to a course via presence
    Then the system shall display the count of online students
    And the system shall list student names and avatars

  @ears-state-driven
  Scenario: View latest activity feed
    While students have accessed course materials
    Then the system shall show a feed of latest activity
    And each entry shall include the student name, learning object, and timestamp

  @ears-state-driven
  Scenario: Aggregate learning records per student
    While multiple learning records exist for a student
    Then the system shall sum time active and page loads
    And the total shall reflect all recorded sessions

  @ears-unwanted
  Scenario: Handle student with no recorded activity
    If a student is enrolled but has no learning records
    Then the system shall show the student with zero engagement
    And the system shall not error when aggregating empty records

  @ears-state-driven
  Scenario: Filter engagement by time period
    While viewing the live activity feed
    Then the system shall group activity by today, this week, this month, and this year
    And empty time periods shall display an appropriate message
