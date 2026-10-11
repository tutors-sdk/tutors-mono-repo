# Reader identity rollout (#432–#433, feature #416)

The reader now uses **Better Auth only on SvelteKit 2**. #433 removes the previous adapter
and its temporary selector without changing Better Auth's session configuration or data keys.
**Merge/deployment gate:** complete #432's live GitHub rehearsal, production Better Auth
activation and rollback rehearsal first. Those checkpoints remain pending by the maintainer's
instruction to deploy later; this cleanup PR prepares the code and does not supply live evidence.

For #432's earlier two-adapter cutover, use the
[rollout guide in #440 at afca918](https://github.com/tutors-sdk/tutors-mono-repo/blob/afca918055f9d21d55f1f930e8479fa3c6fef198/guides/identity-rollout.md).
Its selector applies to that previous image only.

## Exact local baseline

| Component | Tested version |
| --- | --- |
| Better Auth | 1.7.7 (exact dependency) |
| SvelteKit / Node adapter | 2.70.3 / 5.5.7 |
| Svelte / Vite / Svelte Vite plugin | 5.57.0 / 8.3.0 / 7.3.0 |
| Node / pnpm / TypeScript | 22.17.1 / 11.24.0 / 6.0.3 |

Kit 3's compatibility spike (#437) is evidence only. This cleanup includes no framework or
Better Auth version upgrade and needs no peer-range exception.

## Configuration and behavior

- Keep `PRIVATE_AUTH_SECRET` (at least 32 random characters), `PRIVATE_AUTH_GITHUB_ID` and
  `PRIVATE_AUTH_GITHUB_SECRET` server-only and unchanged from the proven Better Auth deployment.
  The adapter selector has been removed; remove it from deployment environment/configuration.
- Keep the Node server's `ORIGIN` at its canonical public HTTPS origin. On other platforms,
  verify SvelteKit's request origin at the deployed callback; do not trust arbitrary proxy headers.
  Better Auth uses this origin for its base URL, trusted-origin checks and secure cookies.
- Keep GitHub's callback at `https://<reader-host>/api/auth/callback/github` and the scopes at
  `read:user user:email`. `/auth` and `/auth/<courseid>` remain sign-in pages.
- GitHub's verified numeric id supplies `Actor.subject=github:<id>`. Login remains the existing
  student-record, analytics and enrollment key. No rows, UUIDs, authorization policies, RLS,
  SSO configuration or auth service are migrated by this cleanup.
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
- Existing **Better Auth sessions need no reauthentication for this cleanup** if origin,
  signing secret and cookie configuration remain unchanged. Sessions from the removed provider
  are not accepted. Complete the preceding cutover/reauthentication before this release.
- Logout clears this browser's cookies. Copied stateless cookies cannot be centrally revoked
  and remain valid until expiry. GitHub tokens stay in encrypted HTTP-only account cookies;
  signing out of the reader does not sign out of GitHub.

## Automated local evidence

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm check
SVELTEKIT_ADAPTER=node pnpm build
pnpm test:identity:built
pnpm test:e2e:reader --project=chromium
pnpm test:e2e:reader --project=firefox tests/e2e/authentication.spec.ts
```

Rules 0250–0259 use one HTTP driver. The built-reader checks exercise actual Node output and
root layout data, time advancement, restart, trusted identity, inactive/rolling expiry, tampered
cookies, protected claims, safe redirects, OAuth state, flags, headers, logout and disabled modes.
`tests/fixtures/reader-session/better-auth-session-before-cleanup.json` contains cookies captured
from #440's built reader at `afca918`, using only the public test credentials. The compatibility
check advances the isolated fixture clock to day 29 and then day 31, proving the preceding
session survives cleanup and renews past its original expiry. Do not regenerate that fixture
from the cleanup implementation: it must continue to represent the preceding deployment.

GitHub is stubbed only by an explicit test-credential-guarded preload; production imports no
fixture. Browser checks obtain real SDK cookies. Supabase writes go to an unshipped discard
fixture. The protected-route fixture uses the reader's actual hooks; replace it with #320/#327's
production route when it lands. Local fixtures do not prove live GitHub or deployed rollback.

CI targeting `main` runs the built check and Chromium UI contract. Stacked PRs do not trigger
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
5. **Rehearse image rollback.** Restore the recorded Better Auth + Kit 2 image with its exact
   prior environment (including its Better Auth selector if that older image requires it),
   origin, credentials and cookie secret. Verify existing sessions and fresh sign-in again.
   Do not add an in-code provider fallback or weaken data access/policies. Preserve the proven
   image and release evidence before the later framework upgrade.

Pending record: rehearsal target **not selected**; live GitHub **not run**; production activation
**not performed**; deployment rollback **not rehearsed**; retained Kit 2 image digest **not recorded**.
