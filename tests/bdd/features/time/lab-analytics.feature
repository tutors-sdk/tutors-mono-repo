Feature: Lab Analytics
  As an instructor
  I want to view lab completion data across students
  So that I can identify which labs need more support

  Scenario: Calculate and display lab medians
    Given 10 students have completed a lab, spending these minutes on its steps:
      | student | book-a/00 | book-a/01 | book-b/00 |
      | s01     | 5         | 5         | 40        |
      | s02     | 10        | 10        | 35        |
      | s03     | 15        | 15        | 30        |
      | s04     | 20        | 20        | 25        |
      | s05     | 25        | 25        | 20        |
      | s06     | 30        | 30        | 15        |
      | s07     | 35        | 35        | 10        |
      | s08     | 40        | 40        | 5         |
      | s09     | 45        | 45        |           |
      | s10     | 50        | 50        |           |
    When I view the lab analytics
    Then I should see the median completion time for each lab:
      | book-a | book-b |
      | 55     | 23     |
    And I should see the median completion time for each step:
      | book-a/00 | book-a/01 | book-b/00 |
      | 28        | 28        | 23        |
    And the median row total should be 73 minutes, the median of the students' totals
