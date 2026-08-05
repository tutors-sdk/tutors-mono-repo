@instructor @ears-event-driven @ears-state-driven
Feature: Calendar Analytics
  As an instructor
  I want to view calendar heatmaps of student activity
  So that I can identify engagement patterns and at-risk students

  @ears-event-driven
  Scenario: View calendar activity by day
    When an instructor opens the calendar analytics view
    Then the system shall display a grid with students as rows
    And each column shall represent a distinct date
    And cell values shall show time active in minutes

  @ears-event-driven
  Scenario: View calendar activity by week
    When an instructor switches to the week view
    Then the system shall aggregate daily activity into weekly columns
    And each week column shall be labelled by its Monday date

  @ears-state-driven
  Scenario: Calculate median activity per day
    While the calendar has data for 5 students across 3 days
    Then the system shall calculate the median time active per day
    And the median row shall show the middle value across students

  @ears-state-driven
  Scenario: Calculate median activity per week
    While the calendar has daily median values
    Then the system shall sum daily medians within each week
    And the total shall be the median of all weekly sums

  @ears-event-driven
  Scenario: Colour code activity cells
    When the calendar grid is displayed
    Then cells with zero activity shall be white
    And cells with moderate activity shall be green
    And cells with very high activity shall transition to red

  @ears-state-driven
  Scenario: Handle empty calendar data
    While no calendar entries exist for a course
    Then the system shall display an empty calendar grid
    And median values shall be zero
