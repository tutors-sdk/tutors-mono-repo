# Lab Analytics

These scenarios are specification prose, not executed. They came from `tests/bdd/features/time/lab-analytics.feature`, whose remaining scenario ("Calculate and display lab medians") is bound and runs. "Display lab completion grid" and "View step-level breakdown for a lab" specify the same behaviour against the same product code (`BaseLabModel` in `packages/jsr/time`) as "View lab completion across students" and "View per-step lab analytics" in the bound feature `tests/bdd/features/instructor/analytics-lab.feature`, so the duplicates are retired here; `tests/unit/time/base-lab-model.test.ts` covers the same model at unit level. "Display learning records for a student" is a click-through in the time app's grid, and the only product code behind it (`CourseTime.getLearningRecords`) returns the Supabase rows untouched, so with Supabase mocked the scenario could only assert on the mock's own return value. No tier drives the time app's UI today (tier G, the Playwright journeys in `tests/e2e-stack`, covers the reader, catalogue and live apps, not the time app).

```gherkin
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
```
