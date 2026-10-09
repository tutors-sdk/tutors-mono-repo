# Reader identity and Kit 3 rollout (#432–#436, feature #416)

The reader now uses **Better Auth only on SvelteKit 3**. #433 removed the previous adapter
and its temporary selector; #434–#435 moved configuration and app imports on Kit 2. #436
upgrades the four apps while preserving Better Auth's session configuration and data keys.
**Merge/deployment gate:** complete #432's live GitHub rehearsal, production Better Auth
activation and rollback rehearsal first. Those checkpoints remain pending by the maintainer's
instruction to deploy later; this stack prepares the code and does not supply live evidence.

For #432's earlier two-adapter cutover, use the
[rollout guide in #440 at afca918](https://github.com/tutors-sdk/tutors-mono-repo/blob/afca918055f9d21d55f1f930e8479fa3c6fef198/guides/identity-rollout.md).
Its selector applies to that previous image only.

## Exact local baseline

| Component | Tested version |
| --- | --- |
| Better Auth | 1.7.7 (exact dependency) |
| SvelteKit / Node adapter | 3.0.1 / 6.0.0 |
| Svelte / Vite / Svelte Vite plugin | 5.57.2 / 8.3.0 / 7.3.0 |
| Node / pnpm / TypeScript | 22.17.1 / 11.24.0 / 6.0.3 |

Auto adapter 8.0.0 selects the app-pinned Netlify adapter 7.0.1 on Netlify. Node must be
at least 22.17. Kit 3 uses cookie 2.0.1; the old cookie override applies only below 0.7.0.
Better Auth 1.7.7 still declares a Kit 2 peer. The only exception permits
`better-auth@1.7.7>@sveltejs/kit: 3.0.1`; a frozen strict-peer install and actual built
session/browser checks cover that exact combination. Reassess it on either upgrade.
The standalone #437 spike is evidence only and is absent from this PR's ancestry.

The preceding Better Auth + Kit 2 source checkpoint is
[#443 at 9b9b519](https://github.com/tutors-sdk/tutors-mono-repo/blob/9b9b519/guides/identity-rollout.md).
It is a source checkpoint, not a recorded or deployed image digest.

## Configuration and behavior

- Keep `PRIVATE_AUTH_SECRET` (at least 32 random characters), `PRIVATE_AUTH_GITHUB_ID` and
  `PRIVATE_AUTH_GITHUB_SECRET` server-only and unchanged from the proven Better Auth deployment.
  The adapter selector has been removed; remove it from deployment environment/configuration.
- Kit 3 removed runtime `ORIGIN`. Keep `PROTOCOL_HEADER=x-forwarded-proto` and
  `HOST_HEADER=x-forwarded-host` only behind an edge that overwrites both headers and preserves
  the public host **including its port**. Keep app ports private. Kubernetes's `TUTORS_ORIGIN`
  is Route/Ingress metadata; it does not fix the application origin. Local/HTTP Compose now
  includes a pinned Caddy proxy. HTTPS staging must configure TLS at the edge; the default local
  Caddyfile serves HTTP. Verify request origin at the callback on Netlify as well.
  Better Auth uses that origin for base URL, trusted origins and secure cookies. Do not set
  build-time `paths.origin`: the same image must promote between environments.
- Shared `src/env.js` declarations keep the existing public/private variables dynamic and
  optional, preserving anonymous/missing-secret operation without a build-time `.env`.
  Existing supported `$env/dynamic` consumers remain until a separate API cleanup.
- Keep GitHub's callback at `https://<reader-host>/api/auth/callback/github` and the scopes at
  `read:user user:email`. `/auth` and `/auth/<courseid>` remain sign-in pages.
- GitHub's verified numeric id supplies `Actor.subject=github:<id>`. Login remains the existing
  student-record, analytics and enrollment key. No rows, UUIDs, authorization policies, RLS,
  SSO configuration or auth service are migrated by this upgrade.
- Signed/encrypted stateless cookies, their names/attributes and the cookie-held OAuth
  state/account configuration stay unchanged. Both the signed token and encrypted claims must
  be valid. A fresh SDK instance per request prevents its fallback memory adapter becoming a
  session store. SDK rate limits are process-local and are not shared between replicas.
- The 30-day inactivity window rolls on page and SvelteKit data requests. The hook extends
  embedded and cookie expiry and forwards every Set-Cookie header. Session-bearing or
  cookie-clearing responses use `private, no-store`. Failed/expired verification never renews
  a session; explicitly disabled refresh stays disabled.
- In 1.7.7, provider mapping requires input-enabled `githubId` and `login`. The update hook
  rejects either key, including null and mixed updates. OAuth `additionalData` cannot replace
  the provider mapping. Only the GitHub flow, session, guarded profile and error endpoints are
  exposed. Origin/CSRF checks are explicit before the first cookie exists. Audit new plugins
  or identity-write endpoints separately.
- Existing **Better Auth sessions need no reauthentication for this upgrade** if origin,
  signing secret and cookie configuration remain unchanged. Sessions from the removed provider
  are not accepted. Complete the preceding cutover/reauthentication before this release.
- Logout clears this browser's cookies. Copied stateless cookies cannot be centrally revoked
  and remain valid until expiry. GitHub tokens stay in encrypted HTTP-only account cookies;
  signing out of the reader does not sign out of GitHub.

## Automated local evidence

```sh
pnpm install --frozen-lockfile
pnpm test --maxWorkers=4
pnpm lint
pnpm check
SVELTEKIT_ADAPTER=node pnpm --filter tutors-reader... --filter tutors-catalogue... --filter tutors-live... --filter tutors-time... build
pnpm test:identity:built
pnpm test:e2e:reader --project=chromium
TEST_READER_BUILT=1 pnpm test:e2e:reader authentication.spec.ts --project=chromium --grep-invert="Forged browser identity"
pnpm test:e2e:reader authentication.spec.ts --project=firefox
pnpm test:e2e:catalogue --project=chromium
pnpm test:e2e:live --project=chromium
pnpm check:server
pnpm check:bundle
pnpm check:build-identity
pnpm check:k8s
```

Rules 0250–0259 use one HTTP driver. The built-reader checks exercise actual Node output and
root layout data, time advancement, restart, trusted identity, inactive/rolling expiry, tampered
cookies, protected claims, safe redirects, OAuth state, flags, headers, logout and disabled modes.
`tests/fixtures/reader-session/better-auth-session-before-cleanup.json` contains cookies captured
from #440's built reader at `afca918`, using only the public test credentials. The compatibility
check advances the isolated fixture clock to day 29 and then day 31, proving the preceding
session survives the Kit 3 upgrade and renews past its original expiry. Do not regenerate that fixture
from the new implementation: it must continue to represent the preceding deployment.

GitHub is stubbed only by an explicit test-credential-guarded preload; production imports no
fixture. Browser checks obtain real SDK cookies. Supabase writes go to an unshipped discard
fixture. The protected-route fixture uses the reader's actual hooks; replace it with #320/#327's
production route when it lands. Local fixtures do not prove live GitHub or deployed rollback.

The built-browser mode uses the real reader build behind a test proxy. It covers OAuth,
navigation/reload, UI logout and rejection with another signing secret. The browser-state
forgery test needs Vite's module URLs and runs in the complete dev suite; built HTTP checks
independently cover forged/tampered cookies. Netlify adapters are pinned in each app because adapter-auto resolves from the app directory.
The app-scoped Knip declaration records this dynamic dependency; no audit allowances are added.

Eight real hook checks ensure expected app,
framework and validation errors retain their messages/status and avoid unexpected-error logs.

CI targeting `main` runs built HTTP and browser identity checks and the Chromium UI contract. Stacked PRs do not trigger
that workflow until retargeted to `main`.

## Deferred deployment checklist

1. **Complete #432 on the preceding image.** Follow its recorded cutover guide with real
   student and educator accounts. Record target URL, OAuth app, canonical origin, operator/date,
   commit/image digest and live identity/profile/enrollment/logout/renewal results. Do not store
   cookies or secrets in the release record.
2. **Retain the proven Better Auth + Kit 2 image and configuration.** Record its immutable
   digest and secret references. This is the rollback target for cleanup and the later Kit 3
   upgrade. A provider rollback must never reopen secured data APIs or database policies.
3. **Release the cleanup after the gate is accepted.** Keep the same signing secret, cookie
   configuration, OAuth credentials, callback and origin. Remove the temporary selector from
   configuration. Finish or abandon in-flight OAuth flows before replacing all instances.
4. **Verify an existing session and a fresh sign-in at the public edge.** Check representative
   student/educator profile, course return URL, personal data, roles, navigation, reload, rolling
   renewal, refusal and logout. Record that a pre-cleanup Better Auth session stays signed in.
5. **Release Kit 3 after the preceding Kit 2 checkpoints pass.** Keep the signing secret,
   cookie names/configuration, callback and data keys unchanged. Confirm TLS and trusted edge
   headers for each app, custom ports, cross-site form rejection, expected error responses,
   `/version`, representative existing sessions and fresh sign-in/reload/renewal/logout.
   Record the tested immutable image digest and deployment configuration. Drain in-flight OAuth
   callbacks during the replacement.
6. **Rehearse image rollback.** Restore the recorded Better Auth + Kit 2 image with its exact
   prior environment (including its Better Auth selector if that older image requires it),
   credentials and cookie secret. For Kit 2 restore its canonical runtime `ORIGIN`, or keep
   the verified trusted proxy headers; do not change the public origin. Keep the secured data
   APIs/database policies in place. Verify existing sessions and fresh sign-in again.
   Do not add an in-code provider fallback or weaken data access/policies. Preserve the proven
   image and release evidence before the later framework upgrade.

Pending record: rehearsal target **not selected**; live GitHub **not run**; production activation
**not performed**; deployment rollback **not rehearsed**; retained Kit 2 image digest **not recorded**.
