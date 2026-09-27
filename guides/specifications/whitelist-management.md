# Whitelist Management

This scenario is specification prose, not executed. It came from `tests/bdd/features/instructor/whitelist-management.feature`, whose other four scenarios are bound and run against `tutorsConnectService.courseVisit` and `tutorsConnectService.checkWhiteList` in `packages/svelte/connect`. "Whitelist check handles missing data gracefully" describes a whitelist table query, and the product has none: the whitelist is the `enrollment.whitelist` array the generator publishes inside the course's `tutors.json`, read in the browser by `checkWhiteList`, so there is no query that can fail and nothing that logs such a failure. What the product does with missing data is also the opposite of "deny by default": a course that requires authentication but publishes no whitelist, or an empty one, is open to every signed-in user. That is a gap between this specification and the product, recorded here rather than asserted either way. Two further differences were found while binding the other scenarios and are reflected in their wording: a student who is not on the whitelist is sent to the home page with no access-denied message, and the sign-in requirement is driven by the course's `auth` property, not by `private` (`isPrivate` only stops the reader broadcasting presence for the course). The check runs in the browser only, so no tier owns a server-side guarantee: tier M (`tests/security`) covers headers, cookies and CSRF, and tier G (the Playwright journeys in `tests/e2e-stack`) runs anonymously against an open fixture course.

```gherkin
  @ears-unwanted
  Scenario: Whitelist check handles missing data gracefully
    If the whitelist table query returns an error
    Then the system shall deny access by default
    And the system shall log the error for debugging
```
