# Student Engagement Monitoring

These scenarios are specification prose, not executed. They came from `tests/bdd/features/instructor/student-engagement.feature`, whose other three scenarios are bound and run against `liveService`, `presenceService` and the activity-feed functions of `packages/svelte/community`. Neither of these two has product code to bind to, and that is a gap between this specification and the product, recorded here rather than asserted either way. "Aggregate learning records per student": the only per-student aggregation in the product is `BaseCalendarModel` in `packages/jsr/time`, which sums *time active* per student per day and week, and that is already executed by `tests/bdd/features/instructor/analytics-calendar.feature`; nothing in `packages/jsr/time` or `apps/time` sums page loads, which the tables show row by row. "Handle student with no recorded activity": the time models are built solely from the `calendar` and `learning_records` rows they are given and never read the course's enrolment list, so an enrolled student with no records is not shown at all, rather than shown with zero engagement. The model's behaviour with no rows at all is owned by `tests/unit/time`. No tier drives the time app's UI (tier G, the Playwright journeys in `tests/e2e-stack`, covers the reader, catalogue and live apps).

```gherkin
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
```
