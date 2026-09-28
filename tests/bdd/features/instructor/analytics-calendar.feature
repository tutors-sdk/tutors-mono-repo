@instructor @ears-event-driven @ears-state-driven
Feature: Calendar Analytics
  As an instructor
  I want to view calendar heatmaps of student activity
  So that I can identify engagement patterns and at-risk students

  @ears-event-driven
  Scenario: View calendar activity by day
    Given the calendar holds these entries:
      | student | date       | minutes |
      | bob     | 2025-01-06 | 60      |
      | alice   | 2025-01-07 | 45      |
      | alice   | 2025-01-06 | 30      |
    When an instructor opens the calendar analytics view
    Then the day grid shall have one row per student, in the order "alice, bob"
    And each day column shall represent a distinct date, in the order "2025-01-06, 2025-01-07"
    And the day grid cells shall show time active in minutes:
      | student | 2025-01-06 | 2025-01-07 | total |
      | alice   | 30         | 45         | 75    |
      | bob     | 60         | 0          | 60    |

  @ears-event-driven
  Scenario: View calendar activity by week
    Given the calendar holds these entries:
      | student | date       | minutes |
      | alice   | 2025-01-06 | 10      |
      | alice   | 2025-01-08 | 20      |
      | alice   | 2025-01-12 | 30      |
      | alice   | 2025-01-13 | 40      |
      | bob     | 2025-01-15 | 25      |
    When an instructor switches to the week view
    Then each week column shall be labelled by its Monday date, in the order "2025-01-06, 2025-01-13"
    And the week grid shall aggregate daily activity into weekly columns:
      | student | 2025-01-06 | 2025-01-13 | total |
      | alice   | 60         | 40         | 100   |
      | bob     | 0          | 25         | 25    |

  @ears-state-driven
  Scenario: Calculate median activity per day
    Given the calendar holds minutes active per student per day:
      | student | 2025-01-06 | 2025-01-07 | 2025-01-08 |
      | s1      | 10         | 5          | 50         |
      | s2      | 20         | 15         | 40         |
      | s3      | 30         | 25         | 30         |
      | s4      | 40         | 35         | 20         |
      | s5      | 50         |            | 10         |
    When an instructor opens the calendar analytics view
    Then the daily median row shall show the middle value across the students active each day:
      | 2025-01-06 | 2025-01-07 | 2025-01-08 |
      | 30         | 20         | 30         |
    And the daily median total shall be 75, the middle of the students' totals

  @ears-state-driven
  Scenario: Calculate median activity per week
    Given the calendar holds minutes active per student per day:
      | student | 2025-01-06 | 2025-01-07 | 2025-01-13 | 2025-01-14 |
      | s1      | 10         | 20         | 30         | 10         |
      | s2      | 20         | 40         | 50         | 20         |
      | s3      | 60         | 30         | 100        | 40         |
    When an instructor switches to the week view
    Then the weekly median row shall sum the daily medians within each week:
      | 2025-01-06 | 2025-01-13 |
      | 50         | 70         |
    And the weekly median total shall be 60, the median of all weekly sums

  @ears-event-driven
  Scenario: Colour code activity cells
    When the calendar grid colours cells holding these minutes of activity:
      | minutes |
      | 0       |
      | 1       |
      | 200     |
      | 400     |
      | 800     |
      | 1600    |
    Then a cell with 0 minutes shall have no heat colour
    And a cell with 1 minutes shall be the lightest success tint, 25% over the surface
    And a cell with 200 minutes shall be the deepest success tint, 70% over the surface
    And a cell with 400 minutes shall be a danger tint, 43% over the surface
    And a cell with 800 minutes shall be the deepest danger tint, 70% over the surface
    And a cell with 1600 minutes shall stay the deepest danger tint, 70% over the surface

  @ears-state-driven
  Scenario: Handle empty calendar data
    Given no calendar entries exist for a course
    When an instructor opens the calendar analytics view
    Then the day grid and the week grid shall have 0 rows
    And the calendar shall have 0 day columns and 0 week columns
    And no daily or weekly median row shall be produced
