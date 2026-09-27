# Authentication

This scenario is specification prose, not executed. It came from `tests/bdd/features/shared/authentication.feature`, whose other three scenarios are bound and run against `tutorsConnectService` in `packages/svelte/connect` (the sign-in request it hands to Auth.js, what it does when the session arrives, and what it records for anonymous and authenticated visitors). "View profile information" is about what the profile menu renders: the avatar and display name are drawn by `packages/svelte/ui-navigators/src/tutors-connect/ConnectedProfile.svelte` from the `tutorsId` rune, and the root Vitest config has no Svelte compiler and no DOM to render a component in. The part of it that is product logic, the reader holding the signed-in user's name once the session arrives, is asserted by the bound "Sign in with GitHub OAuth" scenario. No tier owns the rendered profile today: tier G (the Playwright journeys in `tests/e2e-stack`) runs the stack anonymously with no GitHub OAuth provider, and tier M (`tests/security`) covers the Auth.js cookie flags and CSRF settings, not the profile.

```gherkin
  Scenario: View profile information
    Given I am authenticated as "Alice"
    When I view my profile
    Then I should see my GitHub avatar
    And I should see my display name "Alice"
```
