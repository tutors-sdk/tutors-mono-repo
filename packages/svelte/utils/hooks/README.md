# @tutors/hooks

Shared SvelteKit hooks for the four Tutors apps: security headers, structured
server/client error handlers, and the client-side error transport wiring.

## Entry points

| Import                  | Use from            | Exports                                                  |
| ----------------------- | ------------------- | -------------------------------------------------------- |
| `@tutors/hooks/server`  | `hooks.server.ts`   | `securityHeaders`, `SECURITY_HEADERS`, `createServerErrorHandler()` |
| `@tutors/hooks/client`  | `hooks.client.ts`   | `initClientErrorHandling(appName)`, `createClientErrorHandler()`   |
| `@tutors/hooks/mode`    | either              | `resolveHooksMode()`, `usesSharedHooks()`, `HOOKS_MODE_ENV`, `DEFAULT_HOOKS_MODE` |

Import the subpaths rather than the package root from app code. The root barrel
re-exports everything, which would drag the client module and its Supabase error
transport into a server bundle.

## Rollout switch: `PUBLIC_TUTORS_HOOKS_MODE`

This package was extracted from hooks that were copy-pasted across the apps. To
keep that extraction reversible, every app still carries its original hooks
verbatim in `src/legacy-hooks.server.ts` and `src/legacy-hooks.client.ts`, and
its `hooks.server.ts` / `hooks.client.ts` pick one implementation at startup:

```
PUBLIC_TUTORS_HOOKS_MODE=shared   # use @tutors/hooks
PUBLIC_TUTORS_HOOKS_MODE=legacy   # use the app's original inline hooks
```

The value is read through `$env/dynamic/public`, so it is a runtime setting: no
rebuild is needed to flip it, and a missing variable does not break the build.
When it is unset, blank, or unrecognised the app falls back to
`DEFAULT_HOOKS_MODE`, which is currently `legacy`. That keeps deployments whose
environment predates the flag on the behaviour they had before this package
existed. `.env.example` sets `shared`, so CI and fresh local checkouts exercise
the new path.

Both implementations are behaviourally identical by construction, with one
deliberate exception: the `time` app had no `handle` hook at all before this
package, so in `legacy` mode it still sends no security headers.
`tests/unit/hooks/legacy-parity.test.ts` pins both facts.

## Retiring the legacy path

When `shared` has run in production long enough:

1. Flip `DEFAULT_HOOKS_MODE` in `src/mode.ts` to `"shared"`.
2. Delete `apps/*/src/legacy-hooks.server.ts` and `apps/*/src/legacy-hooks.client.ts`.
3. Collapse each app's `hooks.server.ts` / `hooks.client.ts` to the `shared`
   branch only, and drop the `$env/dynamic/public` import.
4. Delete `src/mode.ts`, `tests/unit/hooks/legacy-parity.test.ts`, and the
   `PUBLIC_TUTORS_HOOKS_MODE` entry in `.env.example`.
