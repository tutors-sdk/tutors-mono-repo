# Authentication Integration

These two scenarios are specification prose, not executed. The rest of the GitHub OAuth flow is now executable: `tests/bdd/features/shared/sign-in-session.feature` (Rules 0250–0259) drives the reader's `hooks.server.ts` over HTTP with GitHub stubbed at `fetch`, covering starting sign-in, the callback, the session the pages see, its 30-day lifetime, forged and tampered cookies, a refused sign-in, sign-out, anonymous mode, a missing secret and the session cookie's flags. Those Rules were written to pin today's behaviour before the move off Auth.js (issue #416).

The [Better Auth / Kit 3 compatibility spike](../identity-compatibility.md) records the migration constraints and a reproducible production-server fixture. Rule 0253 now also pins rolling renewal on page visits, so a replacement cannot silently switch active users to a fixed 30-day deadline.

What stays here needs a browser: the profile in the header is rendered by a Svelte component, and nothing in the reader detects or retries a network failure during sign-in. Tier M (`tests/security/security.test.ts`) still checks the cookie flags and the CSRF origin check as static contracts.

```gherkin
@developer @ears-event-driven @ears-unwanted
Feature: Authentication Integration
  As a developer
  I want GitHub OAuth authentication to work reliably
  So that users can connect their identities to the platform

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
