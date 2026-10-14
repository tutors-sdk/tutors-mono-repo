# Error Handling

These scenarios are specification prose, not executed. Four scenarios of `tests/bdd/features/shared/error-handling.feature` are bound: invalid course URL, network failure and malformed course JSON run against `courseService.readCourse` in `packages/adapters/driving/svelte-state/src/course/services/course.svelte.ts` with a stand-in `fetch`, and Supabase query failure runs against `catalogueService` in `packages/adapters/driving/svelte-state/src/community/services/catalogue.ts`. They assert what the services do (fail, log, cache nothing, fall back, recover). What the user then sees is a rendered page, which needs a SvelteKit server and a browser that Node Vitest lacks, so the original wording of those three scenarios is kept below alongside the one scenario that could not be bound at all.

"Invalid course URL", the page clause, is now bound elsewhere. Binding the load once exposed a product bug: a 404 for `tutors.json` threw a plain `Error`, which SvelteKit rendered as a 500 "Server Error". That is fixed. `courseService` (`packages/adapters/driving/svelte-state/src/course/services/course.svelte.ts`) now throws `CourseNotFoundError` for a 404 and hands it to the app's handler, and the reader sets that handler in `apps/reader/src/hooks.client.ts` to raise SvelteKit's `error(404, ...)`, so `ErrorPage` shows "Page Not Found". `tests/unit/course/course-service-not-found.test.ts` holds the service's side, and Rule 0028 in `tests/bdd/features/ui/shell-and-navigation.feature` ("Unknown course shows Page Not Found") is proved in a browser by `apps/reader/tests/e2e/shell-and-navigation.spec.ts`, which asserts the 404, the "Page Not Found" heading and the "Go Home" link. The bound load scenario above still asserts the error message, which `CourseNotFoundError` keeps ("Fetch failed with status 404"). Tier G's negative journey (`tests/e2e-stack/journeys/negative.journey.spec.ts`) proves a journey fails when `tutors.json` answers 500.

"Supabase query failure", a logging bug found while binding. `catalogueService` logs `log.error("Error fetching courses:", error)`. A Supabase query error is a plain object (`{ message, code, details, hint }`), which `normalizeArgs` in `packages/platform/logger/src/logger.ts` spreads into the log entry as context; the entry's own `message` field is then written over it, so the Supabase error text never reaches the log (only `code`, `details` and `hint` survive). The bound scenario asserts the log message and the fallback, not the lost detail. `tests/unit/community/catalogue-service.test.ts` does not see this because it replaces the logger with a mock.

"WebSocket disconnection": the product has no reconnection logic and no connection status in the presence UI. `packages/adapters/driving/svelte-state/src/community/services/presence.svelte.ts` and `live.svelte.ts` call `.subscribe()` on their channels without a status callback and leave reconnection to `supabase-js`. No tier covers this today.

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
