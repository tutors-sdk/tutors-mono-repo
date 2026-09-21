# Live Presence

These scenarios are specification prose, not executed. They came from `tests/bdd/features/student/live-presence.feature`, whose other four scenarios are bound and run against `tutorsConnectService` (`packages/svelte/connect`) and `presenceService` (`packages/svelte/community`). Neither of these two has product code to bind to, and that is a gap between this specification and the product, recorded here rather than asserted either way. "Student leaves course presence": presence is built on Supabase realtime *broadcast* of `lo-event` messages, not on realtime presence tracking, so there is no leave or disconnect event; `presenceService.studentListener` only ever adds a student or refreshes their record, and nothing in `packages/svelte/community` removes a student or ages one out, so a student who closes their browser stays in the online list until the viewer changes course or reloads. "Handle presence connection failure": `presenceService.startPresenceListener` calls `.subscribe()` with no status callback, so a failed WebSocket is never observed, and no component shows a "presence unavailable" state; the only handled case is a deployment with no Supabase configuration, where the service returns without listening. Showing such a state would also be browser behaviour that Node Vitest cannot drive. No tier owns either behaviour today: tier G (the Playwright journeys in `tests/e2e-stack`) runs the stack anonymously and only checks that the live app renders its tabs.

```gherkin
  @ears-event-driven
  Scenario: Student leaves course presence
    Given 3 students are online in a course
    When one student closes their browser
    Then the system shall remove them from the online list
    And the online count shall decrease to 2

  @ears-unwanted
  Scenario: Handle presence connection failure
    If the WebSocket connection to the presence server fails
    Then the system shall not crash
    And the system shall indicate that live presence is unavailable
```
