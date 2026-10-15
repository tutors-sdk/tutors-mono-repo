# Authentication Integration

`Session persists across page navigation` is now exercised by `apps/reader/tests/e2e/authentication.spec.ts`. The network-failure scenario remains specification prose. The rest of the GitHub OAuth flow is now executable: `tests/bdd/features/shared/sign-in-session.feature` (Rules 0250–0259) drives the reader's `hooks.server.ts` over HTTP with GitHub stubbed at `fetch`, covering starting sign-in, the callback, the session the pages see, its 30-day lifetime, forged and tampered cookies, a refused sign-in, sign-out, anonymous mode, a missing secret and the session cookie's flags. Those Rules run against Better Auth through the HTTP driver (issue #416).

The browser tests prove profile persistence, reload and logout. The remaining gap is a rendered sign-in error and retry flow for network failures. Tier M (`tests/security/security.test.ts`) still checks the cookie flags and the CSRF origin check as static contracts.

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

`@tutors/identity` defines `Actor`, request-scoped `SessionPort` and `IdentityClient` without framework or database imports. `@tutors/identity-sveltekit/server` owns the GitHub-only Better Auth configuration, `/api/auth` endpoints and session renewal cookies. The reader keeps `authMode()` and passes its credentials and enabled predicate into the adapter. Anonymous and unconfigured requests resolve `locals.actor` to `null`. There is one adapter and no selector or provider fallback.

The adapter derives `Actor.subject=github:<numeric account id>` from GitHub's verified profile. Provider-owned `githubId` and `login` cannot be changed by profile updates or OAuth additional data. The existing Better Auth secret, cookie names, OAuth callback, stateless strategy and rolling 30-day expiry stay unchanged through cleanup. The root server layout exposes only the actor and a typed profile; nullable profile fields become strings there. Login remains the key for existing student records, analytics and enrollment. No stored rows or identifiers are migrated.

The browser layout injects `createIdentityClient()` from `@tutors/identity-sveltekit/client` into connect and reconnects the profile only in the browser. Connect has no provider imports; sharing, sentiment, presence, course roles and privacy remain its existing services' responsibility. See [identity rollout](../identity-rollout.md) for the preceding deployment gate, session continuity and image rollback.
