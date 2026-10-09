# Better Auth / SvelteKit 3 compatibility spike

Feature [#416](https://github.com/tutors-sdk/tutors-mono-repo/issues/416), preflight for [#430](https://github.com/tutors-sdk/tutors-mono-repo/issues/430). Tested on 9 October 2026, against the reader baseline at `a5d00c5`.

## Decision

Proceed with the identity boundary. Better Auth 1.7.7 works in a built Kit 3.0.1 Node application with GitHub-only stateless sessions. No database or data-key migration is needed for this flow. This is a compatibility result, not a production cutover: the adapter must carry the identity guard, cookie forwarding, rolling expiry, and logout navigation described below.

The application is an isolated test fixture outside the pnpm workspace. The runner copies it to a temporary directory, copies the reader's actual `authMode()` helper, installs its own lockfile, checks/builds it, drives the production Node server over HTTP, and removes the temporary application. Neither the root dependencies nor the production apps are upgraded by this PR.

## Exact versions

| Component             | Tested version |
| --------------------- | -------------- |
| Node                  | 22.17.1        |
| pnpm                  | 11.24.0        |
| Better Auth           | 1.7.7          |
| SvelteKit             | 3.0.1          |
| Node adapter          | 6.0.0          |
| Svelte                | 5.57.2         |
| Vite                  | 8.3.4          |
| Svelte Vite plugin    | 7.3.1          |
| TypeScript            | 6.0.3          |
| svelte-check          | 4.7.6          |
| Node type definitions | 22.17.0        |

An unmodified strict-peer install fails because Better Auth 1.7.7 declares `@sveltejs/kit: ^2.0.0`. The fixture keeps `strictPeerDependencies: true` and permits only `better-auth@1.7.7>@sveltejs/kit: 3.0.1`. It does not change the workspace's peer policy, patch the SDK, or accept arbitrary Kit/Better Auth versions. Vite's release-age exception also names the exact tested `vite@8.3.4` version. Reassess both exceptions when selecting versions for #436.

Application checking uses `strict: true` and the reader's existing `skipLibCheck: true` policy. A trial with full dependency declaration checking found Better Auth's optional `bun:sqlite` type import in this Node-only project. Adding Bun's global types introduces Vite/Bun declaration conflicts; no Bun types or fake declarations are retained. Consumer-facing SvelteKit integration types pass, but the entire dependency declaration graph is not certified.

## Required adapter behavior

### Identity comes from GitHub, not profile updates

Map the trusted `/user` response to `githubId` and `login`, and form the actor subject as `github:<numeric-id>`. Validate the ID as a positive safe integer. Keep login separately for existing data keys; do not use Better Auth's generated user ID as the durable Tutors identity. A changed GitHub login preserves the subject.

There are two unsafe/incomplete alternatives, both reproduced by negative controls:

- `input: false` drops custom fields returned by `mapProfileToUser`; it produces a signed-in Better Auth user without the required GitHub claims.
- Input-enabled custom fields without an update guard can be overwritten through `/update-user`, then signed into a new session cookie.

The tested candidate enables provider mapping and uses a Better Auth before-hook to reject every `/update-user` payload containing `githubId` or `login`, including null values and mixed profile/identity updates. Ordinary name updates still work. Client-supplied OAuth `additionalData` cannot replace the trusted profile mapping. Keep GitHub as the only provider and account linking disabled; new identity-writing endpoints/plugins require an explicit review and regression coverage.

### Forward session cookies from page requests

`svelteKitHandler` routes auth requests but does not populate the actor or forward headers from a separate `auth.api.getSession()` call. Populate request-local identity explicitly and include `sveltekitCookies(getRequestEvent)` as the last plugin. The production-server test proves a page request forwards refreshed `Set-Cookie` headers; the same request loses them when the plugin is removed.

The fixture uses Kit 3's `Handle` import from `@sveltejs/kit/hooks`, `$app/env`, Vite-based configuration, and `$app/tsconfig`. An overridden tsconfig `types` list must retain `$app/types`.

### Preserve rolling 30-day expiry

The reader's Auth.js implementation renews JWT expiry on a page visit. The new Rule 0253 scenario proves a visit on day 29 issues a cookie expiring on day 59 and still signs the visitor in on day 31. The existing inactive-session scenario remains unchanged.

Better Auth's `expiresIn: 30 days`, `cookieCache.maxAge: 30 days`, and `refreshCache: true` preserve an inactive 30-day session, but cache refresh alone retains the original `session.expiresAt`. The spike reproduces expiry on day 31 even after a day-29 refresh.

The tested candidate uses an after-hook on successful `/get-session` calls and the exported `setSessionCookie` helper from `better-auth/cookies` to issue a new 30-day expiry. It respects `disableRefresh` and requires both a non-null endpoint result and an unexpired verified session. Checking `context.session` alone is insufficient: the SDK can leave an expired record there while returning null. Regression checks prove that original expired cookies and refreshed cookies after 30 days of inactivity cannot be revived, including after a server restart. This hook is version-sensitive and must remain covered when upgrading Better Auth.

### Handle logout navigation and callback changes

Use `/api/auth/callback/github` as the new GitHub callback and keep the reader's `/auth` course-selection pages available. Better Auth's GitHub sign-out clears the session and returns success JSON; it does not redirect even when `callbackURL` is supplied. The identity client must navigate to the validated return URL after successful sign-out to preserve Rule 0256. The spike proves cookie removal and the subsequent anonymous page, but does not execute that browser navigation.

## Evidence and reproduction

From the repository root, with Node >=22.17 and pnpm 11.24.0:

```sh
pnpm install --frozen-lockfile
pnpm --filter tutors-reader exec svelte-kit sync
pnpm exec vitest run tests/bdd/steps/shared/sign-in-session.steps.ts tests/unit/reader/auth-mode.test.ts
node scripts/spikes/identity-compatibility.mjs
```

The reader auth/mode baseline passes 84 assertions, including the new rolling-expiry scenario. The separate fixture passes its strict application check, production build, and 23 HTTP/bundle checks: OAuth app/scopes/callback, trusted profile and SSR page data, 30-day inactivity, forged/tampered cookies, refusal, logout, secure cookie flags, unsafe state/origin/redirects, guarded claims, restart persistence, refresh forwarding, anonymous/missing-secret operation, negative controls, GitHub rename, rolling expiry, request isolation, and absence of server credentials in browser bundles.

GitHub's token and profile endpoints are stubbed only by the disposable server's `--import runtime.mjs` preload. Requests go to the real built Node server. HTTPS identity/origin is simulated with forwarded headers on a loopback connection; this is not a real TLS/browser/proxy deployment test.

Not covered here: live GitHub OAuth, the full reader running Better Auth on Kit 2, production proxy/header/cookie limits, browser logout navigation, or the other three apps. Those remain gates in #431/#432/#436. Stateless logout removes this browser's cookies; copied cookies are not centrally revoked. This matches the limitations of the current JWT approach, but stronger revocation would require a separate storage decision.

Sources: [Kit 3 migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3), [Better Auth SvelteKit integration](https://better-auth.com/docs/integrations/svelte-kit), [stateless session management](https://better-auth.com/docs/concepts/session-management), [provider/custom-field ownership](https://better-auth.com/docs/concepts/database). Behavioral findings above come from the pinned fixture and installed package source, rather than assuming the documentation's examples preserve Tutors behavior.
