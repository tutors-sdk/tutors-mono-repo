# Lab Analytics

These scenarios are specification prose, not executed. They came from `tests/bdd/features/instructor/analytics-lab.feature`, whose other three scenarios are bound and run against `BaseLabModel` in `packages/jsr/time`. Neither of these two has product code to bind to. "Compare lab activity across course": nothing in `packages/jsr/time` or `apps/time` computes a total duration per lab across all students (the model holds per-student totals and per-lab medians only), and column sorting is ag-grid behaviour in the browser. "Handle labs with no student activity": `BaseLabModel` derives its lab columns solely from the learning records it is given and never sees the course's authored labs, so a lab no student has opened is not listed at all, which is the opposite of what the scenario specifies. That is a gap between this specification and the product, recorded here rather than asserted either way. No tier drives the time app's UI today (tier G, the Playwright journeys in `tests/e2e-stack`, covers the reader, catalogue and live apps, not the time app); `tests/unit/time/base-lab-model.test.ts` owns the model's behaviour with no records.

```gherkin
  @ears-event-driven
  Scenario: Compare lab activity across course
    When an instructor views the lab analytics overview
    Then the system shall show total duration per lab across all students
    And labs shall be sortable by total engagement

  @ears-state-driven
  Scenario: Handle labs with no student activity
    While a lab has been authored but no students have accessed it
    Then the system shall show the lab with zero activity
    And the lab shall still be listed in the analytics view
```
