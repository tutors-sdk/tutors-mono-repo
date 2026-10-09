# Authentication Integration

These two scenarios are specification prose, not executed. The rest of the GitHub OAuth flow is now executable: `tests/bdd/features/shared/sign-in-session.feature` (Rules 0250–0259) drives the reader's `hooks.server.ts` over HTTP with GitHub stubbed at `fetch`, covering starting sign-in, the callback, the session the pages see, its 30-day lifetime, forged and tampered cookies, a refused sign-in, sign-out, anonymous mode, a missing secret and the session cookie's flags. Those Rules were written to pin today's behaviour before the move off Auth.js (issue #416).

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

## Identity boundary

`@tutors/identity` defines `Actor`, request-scoped `SessionPort` and `IdentityClient` without framework or database imports. `@tutors/identity-sveltekit/server` owns Auth.js configuration, `/auth` endpoints and session renewal cookies. The reader keeps `authMode()` and passes its credentials and enabled predicate into the adapter. Anonymous and unconfigured requests resolve `locals.actor` to `null`.

The adapter records the verified OAuth account’s numeric GitHub id in the JWT and derives `Actor.subject` as `github:<numeric account id>`. Auth.js generates a UUID for `sub`, so previously issued JWTs have no numeric GitHub id. They remain signed in with `authjs:<uuid>` until the next GitHub sign-in, which supplies the trusted numeric id. Never resolve an old login through GitHub’s public lookup: a renamed login could belong to someone else. The secret, cookie names, `/auth` path, JWT strategy and rolling 30-day expiry stay unchanged. The root server layout exposes only the actor and a typed profile; nullable profile fields become strings there. GitHub login remains the key for existing student records, analytics and enrollment. No stored rows or identifiers are migrated.

The browser layout injects `@tutors/identity-sveltekit/client` into connect and reconnects the profile only in the browser. Connect has no provider imports; sharing, sentiment, presence, course roles and privacy remain its existing services' responsibility. To replace Auth.js, implement the same two adapter exports and retain the contracts and behavioral rules.

Dependency-cruiser enforces provider ownership, self-contained contracts and transitive browser/server separation. Negative fixtures exercise forbidden provider, framework, database and secret imports. Identity regression tests cover legacy JWTs, trusted account ids, missing claims and isolation between concurrent requests. Rules 0250–0259 remain the provider-independent behavioral baseline.
