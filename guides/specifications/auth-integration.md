# Authentication Integration

These scenarios are specification prose, not executed. Every one of them describes the GitHub OAuth flow as a person sees it: a click on "Sign in with GitHub", a redirect to GitHub, the callback, a session cookie, a redirect to the sign-in page, a profile in the header. In the reader that flow is Auth.js (`@auth/sveltekit`) wired up in `apps/reader/src/hooks.server.ts` and the `(auth)` routes; it needs a running SvelteKit server, a browser and a GitHub OAuth counterpart, none of which exist in Node Vitest, and the product holds no Node-callable function that decides any of these outcomes. The only authentication logic the reader owns outright is whether Auth.js runs at all, and that is covered: `tests/unit/reader/auth-mode.test.ts` drives `authMode()` in `apps/reader/src/lib/server/auth-mode.ts`, and tier G (`tests/e2e-stack/journeys/student.journey.spec.ts`, "reader with no auth configuration") proves the reader serves pages when no secret is set. Tier M (`tests/security/security.test.ts`) checks the flags of the cookies Auth.js sets and the CSRF origin check, as static contracts. `apps/reader/tests/e2e/smoke.spec.ts` opens the auth page. Beyond that, no tier covers this today: nothing signs in through GitHub, signs out, returns an OAuth callback error, expires a session or fails the network during sign-in.

```gherkin
@developer @ears-event-driven @ears-unwanted
Feature: Authentication Integration
  As a developer
  I want GitHub OAuth authentication to work reliably
  So that users can connect their identities to the platform

  @ears-event-driven
  Scenario: Sign in with GitHub
    When a user clicks "Sign in with GitHub"
    Then the system shall redirect to GitHub's OAuth flow
    And upon successful authorisation the system shall create a session

  @ears-event-driven
  Scenario: Sign out clears session
    When an authenticated user clicks disconnect
    Then the system shall clear the session
    And the system shall redirect to the home page

  @ears-unwanted
  Scenario: Handle OAuth callback error
    If GitHub returns an error during the OAuth callback
    Then the system shall display an error message
    And the system shall not create a session

  @ears-unwanted
  Scenario: Handle expired session
    If a user's session token has expired
    Then the system shall redirect to the sign-in page
    And the system shall not display protected content

  @ears-event-driven
  Scenario: Session persists across page navigation
    When an authenticated user navigates between pages
    Then the system shall maintain the session
    And the user's profile shall remain visible in the header

  @ears-unwanted
  Scenario: Handle network failure during auth
    If the network is unavailable during authentication
    Then the system shall display a connection error
    And the system shall allow retry
```
