Feature: Lab Analytics
  As an instructor
  I want to view lab completion data across students
  So that I can identify which labs need more support

  Scenario: Display lab completion grid
    Given a course has 5 labs and 10 enrolled students
    When I view the lab analytics
    Then I should see a grid with 10 rows and 5 columns
    And each cell should show the student's time on that lab

  Scenario: View step-level breakdown for a lab
    Given a lab has 4 steps
    When I click on a lab column header
    Then I should see per-step completion data
    And steps should be ordered by their sequence

  Scenario: Display learning records for a student
    Given a student has completed 3 labs
    When I click on a student row
    Then I should see their learning records
    And records should include duration and completion count

  Scenario: Calculate and display lab medians
    Given 10 students have completed a lab
    When I view the lab analytics
    Then I should see the median completion time for each lab
    And medians should be displayed in the column footer
