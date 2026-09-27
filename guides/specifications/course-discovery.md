# Course Discovery

These scenarios are specification prose, not executed. They came from `tests/bdd/features/student/course-discovery.feature`, whose remaining scenarios ("Browse available courses in catalogue", "Filter courses by topic" and "View course details") are bound and run. "Search for a course by keyword" has no product code behind it: the catalogue app (`apps/catalogue`) lists established courses by visit count and offers no search box or relevance ranking, so there is nothing for Node Vitest, or any other tier, to drive until that feature exists. "Navigate from catalogue to course reader" is a click on a course card followed by a browser navigation; the link is built inside the Svelte component `packages/svelte/ui-components/src/time/Catalogue.svelte`, and the root Vitest config has neither a Svelte compiler nor a DOM. Browser behaviour belongs to tier G (Playwright journeys in `tests/e2e-stack`), which covers the reader only today; the catalogue app has its own smoke spec in `apps/catalogue/tests/e2e/smoke.spec.ts`.

```gherkin
  @ears-event-driven
  Scenario: Search for a course by keyword
    When a student searches for "programming"
    Then the system shall return courses matching the search term
    And results shall be ordered by relevance

  @ears-event-driven
  Scenario: Navigate from catalogue to course reader
    Given a student is viewing the course catalogue
    When the student clicks on a course card
    Then the system shall navigate to the course reader for that course
```
