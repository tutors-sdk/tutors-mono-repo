# Reader identity rollout (#432, feature #416)

This PR adds Better Auth on **SvelteKit 2** behind the existing identity port. It keeps
`PRIVATE_AUTH_ADAPTER=authjs` as the default. Deployment, live GitHub rehearsal, production
cutover and rollback rehearsal are **pending**, by the maintainer's instruction to deploy later.
Do not remove Auth.js or move this deployment to Kit 3 until the checkpoints below are recorded.

## Exact local baseline

| Component | Tested version |
| --- | --- |
| Better Auth | 1.7.7 (exact dependency) |
| Auth.js core / SvelteKit integration | 0.41.3 / 1.11.3 |
| SvelteKit / Node adapter | 2.70.3 / 5.5.7 |
| Svelte / Vite / Svelte Vite plugin | 5.57.0 / 8.3.0 / 7.3.0 |
| Node / pnpm / TypeScript | 22.17.1 / 11.24.0 / 6.0.3 |

Kit 3's separate compatibility spike (#437) is evidence only. This implementation needs no
peer-range exception. Re-run the identity checks when changing Better Auth: 1.7.7 needs the
protected-field and rolling-expiry hooks described below.

## Configuration and behavior

- `PRIVATE_AUTH_ADAPTER`: `authjs` or `better-auth`. Omitted/empty selects Auth.js. Any other
  value fails the request; an auth failure never retries another adapter.
- Keep `PRIVATE_AUTH_SECRET` (at least 32 random characters), `PRIVATE_AUTH_GITHUB_ID` and
  `PRIVATE_AUTH_GITHUB_SECRET` server-only. No new database, migration or identity table is needed.
- Set the Node server's `ORIGIN` to its canonical public HTTPS origin. On other hosting platforms,
  verify SvelteKit's request origin at the deployed callback; do not trust arbitrary proxy headers.
  Better Auth uses that origin for its base URL, trusted-origin checks and secure cookies.
- Auth.js's GitHub callback is `https://<reader-host>/auth/callback/github`.
  Better Auth's callback is `https://<reader-host>/api/auth/callback/github`.
  `/auth` and `/auth/<courseid>` stay sign-in pages. GitHub scopes stay `read:user user:email`.
- GitHub's verified numeric account id supplies `Actor.subject=github:<id>`. Login stays the
  existing student-record, analytics and enrollment key. A renamed login keeps its numeric
  subject, but existing login-keyed records retain their current behavior; this does not migrate
  them. No UUID conversion, RLS, SSO or auth-service extraction is included.
- Better Auth uses signed/encrypted stateless cookies and cookie-held OAuth state/accounts.
  Both the signed session token and encrypted claims must be valid. Each request creates a
  fresh SDK instance so its fallback memory adapter cannot become an accidental session store.
  SDK rate limits use its process-level memory store; replicas do not share those limits.
- The 30-day inactivity window rolls on page loads, including SvelteKit data requests. The
  hook extends both the embedded expiry and the cookie expiry and forwards every Set-Cookie
  header. Failed or expired verification never renews a session. An explicitly disabled
  refresh stays disabled.
- 1.7.7 drops provider-mapped fields with `input:false`, so `githubId` and `login` are input-enabled
  and the before-hook rejects either key at `/update-user`, including null and mixed updates.
  OAuth `additionalData` cannot replace the provider mapping. Only the GitHub flow, session,
  guarded profile update and error endpoints are exposed. New plugins or identity-write paths
  require another audit. Origin/CSRF checks are explicit, including before the first cookie exists.
- Switching adapters requires signing in again. Cookie formats are incompatible. The selected
  adapter clears the retired namespace (including chunks), so an old cookie cannot restore a
  pre-cutover session after logout and rollback. There is no dual-provider verification.
- Logout clears this browser's cookies. As with the previous JWT design, a copied stateless
  cookie cannot be centrally revoked and remains valid until expiry. GitHub OAuth tokens are
  held only in encrypted HTTP-only account cookies; this does not log the user out of GitHub.

## Automated local evidence

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm check
SVELTEKIT_ADAPTER=node pnpm build
pnpm test:identity:built
PRIVATE_AUTH_ADAPTER=authjs pnpm test:e2e:reader --project=chromium
PRIVATE_AUTH_ADAPTER=better-auth pnpm test:e2e:reader --project=chromium
```

Rules 0250–0259 run for both adapters through one HTTP driver. The built-reader check uses the
actual Node output and root layout data, advances an isolated test clock, restarts the process,
and verifies identity, inactive/rolling expiry, malformed cookies, protected fields, safe
redirects, OAuth state, secure flags, header forwarding, logout and disabled modes. GitHub is
stubbed only by an explicit test-credential-guarded Node preload; production imports no fixture.
Browser checks obtain real SDK cookies and cover profile navigation/reload/logout and existing
student/educator controls. Supabase writes go to an unshipped local discard fixture.

CI targeting `main` runs the built check and both Chromium UI matrices. Stacked PRs do not
trigger that workflow until retargeted to `main`. The browser protected-route check currently
uses an unshipped fixture with the reader's actual hooks. Replace it with #320/#327's production
route when that route lands, and recheck its actor/role guard with both adapters.

## Deferred deployment checklist

Record the deployment URL, GitHub OAuth app, commit, image digest, operator and date for each
step. Local fixture tests do not count as live GitHub or deployment evidence.

1. **Choose an isolated rehearsal deployment on Kit 2.** Use a separate GitHub OAuth app with
   that deployment's hostname. GitHub OAuth apps have one configured callback; do not change
   the production app for a preview. Record the current production callback, client id, secret
   references, auth flag, hosting origin/proxy configuration and previous image digest.
2. **Deploy with Auth.js selected first.** Verify the deployment is the expected commit/image,
   HTTPS origin and cookie flags. With representative existing student and educator accounts,
   confirm GitHub login, numeric id, course return URL, profile, personal data and enrollment.
   Record the login-based records used for comparison, without storing tokens or secrets.
3. **Rehearse the switch on that same Kit 2 deployment.** Change the rehearsal GitHub app's
   callback to `/api/auth/callback/github`, keep its matching client id/secret, then set
   `PRIVATE_AUTH_ADAPTER=better-auth` and restart all instances. Avoid mixed-adapter replicas
   and finish or abandon in-flight OAuth flows. Tell participants they must sign in again.
4. **Use live GitHub, including refusal.** Repeat the student/educator checks, navigation and
   reload, a returning login and a fresh sign-in, and logout followed by reload. Verify the
   actual subject against the account's numeric GitHub id and the unchanged login-keyed
   student/enrollment records. Check response headers, HTTPS callback and forwarded renewal
   cookies at the public edge. Record successes and failures; do not paste cookie contents.
5. **Rehearse rollback before production cutover.** Restore the GitHub app's original
   `/auth/callback/github`, original client id/secret references, origin/hosting configuration,
   `PRIVATE_AUTH_ADAPTER=authjs` and the known Kit 2 image. Restart every instance and reauthenticate
   both accounts. Verify sign-in, protected/personal data, course roles and logout again.
   **The flag alone is insufficient:** the OAuth callback/configuration and image must agree.
6. **Schedule production cutover after evidence is accepted.** Preserve the recorded Auth.js
   configuration and image digest; announce reauthentication. Perform the callback/flag change
   together and repeat step 4 on representative production accounts. Roll back using step 5
   if callback failures, missing actors, profile/enrollment changes or cookie/renewal failures appear.
7. **Retain the proven Better Auth + Kit 2 image and configuration.** Record its immutable digest
   as the rollback target for the later Kit 3 upgrade. Keep Auth.js until the live rehearsal,
   production Better Auth activation and rehearsed rollback are recorded on #432/#416.

Pending record: rehearsal target **not selected**; live GitHub **not run**; production activation
**not performed**; deployment rollback **not rehearsed**; retained Kit 2 image digest **not recorded**.
