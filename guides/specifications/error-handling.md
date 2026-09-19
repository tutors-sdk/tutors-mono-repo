# Error Handling

These scenarios are specification prose, not executed. Four scenarios of `tests/bdd/features/shared/error-handling.feature` are bound: invalid course URL, network failure and malformed course JSON run against `courseService.readCourse` in `packages/svelte/course/src/course/services/course.svelte.ts` with a stand-in `fetch`, and Supabase query failure runs against `catalogueService` in `packages/svelte/community/src/services/catalogue.ts`. They assert what the services do (fail, log, cache nothing, fall back, recover). What the user then sees is a rendered page, which needs a SvelteKit server and a browser that Node Vitest lacks, so the original wording of those three scenarios is kept below alongside the one scenario that could not be bound at all.

"Invalid course URL", the page clause. Binding the load exposed a product bug, so the "Not Found" clause is held here rather than bound. When `tutors.json` answers 404, `getOrLoadCourse` throws a plain `Error("Fetch failed with status 404")`, and the course routes (for example `apps/reader/src/routes/(course-reader)/course/[courseid]/+page.ts`) let it propagate without turning it into SvelteKit's `error(404, ...)`. To SvelteKit that is an unexpected error, which it renders through `+error.svelte` with status 500, so `ErrorPage` (`packages/svelte/ui-primitives/src/components/ErrorPage.svelte`) shows its "Server Error" heading and never the "Page Not Found" heading it has for 404. A course that does not exist is reported as a fault on our end. The nearest tier is `apps/reader/tests/e2e/smoke.spec.ts` ("returns error page for invalid course"), which only asserts that the body is visible; tier G's negative journey (`tests/e2e-stack/journeys/negative.journey.spec.ts`) proves a journey fails when `tutors.json` answers 500. No tier asserts the status or the "Not Found" page today.

"Supabase query failure", a logging bug found while binding. `catalogueService` logs `log.error("Error fetching courses:", error)`. A Supabase query error is a plain object (`{ message, code, details, hint }`), which `normalizeArgs` in `packages/svelte/utils/logger/src/logger.ts` spreads into the log entry as context; the entry's own `message` field is then written over it, so the Supabase error text never reaches the log (only `code`, `details` and `hint` survive). The bound scenario asserts the log message and the fallback, not the lost detail. `tests/unit/community/catalogue-service.test.ts` does not see this because it replaces the logger with a mock.

"WebSocket disconnection": the product has no reconnection logic and no connection status in the presence UI. `packages/svelte/community/src/services/presence.svelte.ts` and `live.svelte.ts` call `.subscribe()` on their channels without a status callback and leave reconnection to `supabase-js`. No tier covers this today.

```gherkin
  @ears-unwanted
  Scenario: Invalid course URL
    If a user navigates to a course URL that does not exist
    Then the system shall display a "Not Found" page
    And the system shall provide a link to return home

  @ears-unwanted
  Scenario: Network failure during course load
    If the network is unavailable when loading course data
    Then the system shall display an error message
    And the system shall not show a blank page

  @ears-unwanted
  Scenario: Malformed course JSON
    If the course JSON is malformed or missing required fields
    Then the system shall display a fallback error view
    And the system shall log the parsing error

  @ears-unwanted
  Scenario: WebSocket disconnection
    If the Supabase Realtime connection drops
    Then the system shall attempt reconnection
    And the presence UI shall indicate the connection status
```
