# Presence Tracking

These scenarios are specification prose, not executed. They came from `tests/bdd/features/live/presence-tracking.feature`, whose other two scenarios are bound and run against `liveService` and `presenceService` in `packages/svelte/community`. "Handle student disconnect" has no product code to bind to: the live app listens to Supabase realtime *broadcast* `lo-event` messages, which carry no disconnect, and neither `liveService` nor `presenceService` ever removes a student or lowers a count, so a student who disconnects stays listed until the page is reloaded. That is a gap between this specification and the product, recorded here rather than asserted either way. "Group students by course" is real behaviour, but it lives in a Svelte component: `packages/svelte/ui-components/src/time/CourseGroup.svelte` filters `liveService.studentsOnline` by course inside a `$derived`, and the root Vitest config has no Svelte compiler and no DOM to render it in. The service state that grouping reads (one record per student, each carrying its `courseId`) is what the bound scenarios assert. No tier owns the rendered grouping today: tier G (the Playwright journeys in `tests/e2e-stack`) only checks that the live app renders its Courses and Students tabs, with nobody online.

```gherkin
  Scenario: Handle student disconnect
    Given a student "Alice" is active on "web-dev-101"
    When "Alice" disconnects from the WebSocket
    Then "Alice" should be removed from the active students list
    And the active count for "web-dev-101" should decrease by 1

  Scenario: Group students by course
    Given 5 students are online across 3 courses
    When I view the live dashboard
    Then students should be grouped by their current course
    And each group should show the correct student count
```
