# Offline Resilience

These scenarios are specification prose, not executed. One scenario of `tests/bdd/features/shared/offline-resilience.feature` is bound: "Failed API call does not corrupt local state" runs against the course cache of `courseService` in `packages/svelte/course/src/course/services/course.svelte.ts`, which is the state the reader keeps between page loads (its original wording, about a Supabase call, is kept below; the Supabase fallback itself is bound in `error-handling.feature`). The other three describe behaviour the product does not have, so Node Vitest is not what is missing: there is no reconnection logic (`presence.svelte.ts` and `live.svelte.ts` in `packages/svelte/community/src/services` subscribe to their channels without a status callback and leave reconnection to `supabase-js`), no stale-data indicator anywhere under `apps/` or `packages/`, and no app registers a service worker (there is no `service-worker` file in any app). No tier covers these today.

```gherkin
  @ears-unwanted
  Scenario: Reconnection after temporary disconnect
    If the network connection is temporarily lost and restored
    Then the system shall re-establish WebSocket connections
    And the presence service shall resume broadcasting

  @ears-state-driven
  Scenario: Stale data indicator
    While the system has not received fresh data for an extended period
    Then the system shall indicate that displayed data may be stale

  @ears-unwanted
  Scenario: Failed API call does not corrupt local state
    If an API call to Supabase fails
    Then the system shall retain previously loaded data
    And the system shall not overwrite valid state with error state

  @ears-state-driven
  Scenario: Service worker caches static assets
    While the application has been loaded at least once
    Then static assets shall be available from the service worker cache
```
