Feature: Calendar Analytics
  As an instructor
  I want to view student activity on a calendar heatmap
  So that I can identify engagement patterns over time

  Scenario: Display calendar heatmap for a course
    Given a course "web-dev-101" has activity data for 30 days
    When I view the calendar analytics for "web-dev-101"
    Then I should see a calendar grid with 30 populated cells
    And cells should be colour-coded by activity level

  Scenario: View daily activity breakdown
    Given a course has activity on "2024-03-15"
    When I click the cell for "2024-03-15"
    Then I should see a list of students active on that day
    And each student should show their time spent

  Scenario: View weekly aggregation
    Given a course has activity across multiple weeks
    When I switch to the weekly view
    Then activity should be aggregated by week
    And I should see weekly totals for each student

  Scenario: Calculate median engagement
    Given 10 students have varying activity levels
    When the median is computed
    Then the median should be between the minimum and maximum values
    And the median should be displayed on the analytics view

  Scenario: Identify low-engagement students
    Given 10 students have activity data
    And 3 students have less than 10 minutes of total activity
    When I view the engagement summary
    Then the 3 low-engagement students should be highlighted
