# Calendar Analytics

These scenarios are specification prose, not executed. They came from `tests/bdd/features/time/calendar-analytics.feature`, which was retired whole. Three of them (the heatmap grid, the weekly aggregation and the median) specify the same behaviour against the same product code (`BaseCalendarModel` and `heatColor` in `packages/jsr/time`) as the bound feature `tests/bdd/features/instructor/analytics-calendar.feature`, which is the richer of the two and is the one that runs; `tests/unit/time` covers the same model at unit level. "View daily activity breakdown" is a click-and-drill-down interaction in the time app's grid, which cannot be driven without a browser, and no tier drives the time app's UI today (tier G, the Playwright journeys in `tests/e2e-stack`, covers the reader, catalogue and live apps, not the time app). "Identify low-engagement students" has no product code behind it: nothing in `packages/jsr/time` or `apps/time` applies a low-engagement threshold or highlights students below one, so there is nothing to bind until that is built.

```gherkin
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
```
