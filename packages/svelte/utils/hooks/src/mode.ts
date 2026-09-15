/**
 * Selects which hooks implementation an app runs.
 *
 * - `legacy` — the app's original inline hooks, kept verbatim in each app's
 *   `legacy-hooks.server.ts` / `legacy-hooks.client.ts`.
 * - `shared` — the implementations exported from this package.
 *
 * Apps read `PUBLIC_TUTORS_HOOKS_MODE` from `$env/dynamic/public` and pass it
 * to `resolveHooksMode()`. Keeping the env read in the app (not here) leaves
 * this module free of SvelteKit virtual imports, so it is trivially testable.
 *
 * The default is `legacy` so that deployments whose environment predates the
 * flag keep their existing behaviour. Once `shared` has proven itself, flip
 * `DEFAULT_HOOKS_MODE` to `shared`, then delete the legacy modules and this
 * switch altogether.
 */

export type HooksMode = "legacy" | "shared";

/** Name of the public env var that selects the hooks implementation. */
export const HOOKS_MODE_ENV = "PUBLIC_TUTORS_HOOKS_MODE";

/** Mode used when the env var is unset, blank, or unrecognised. */
export const DEFAULT_HOOKS_MODE: HooksMode = "legacy";

const HOOKS_MODES: readonly HooksMode[] = ["legacy", "shared"];

/**
 * Normalises a raw env value into a {@link HooksMode}.
 *
 * Matching is case-insensitive and ignores surrounding whitespace. Anything
 * that is not exactly one of the known modes falls back to
 * {@link DEFAULT_HOOKS_MODE}, so a typo in a deployment can never select an
 * undefined third state.
 */
export function resolveHooksMode(raw: string | undefined | null): HooksMode {
  if (typeof raw !== "string") return DEFAULT_HOOKS_MODE;
  const value = raw.trim().toLowerCase();
  return (HOOKS_MODES as readonly string[]).includes(value) ? (value as HooksMode) : DEFAULT_HOOKS_MODE;
}

/** Convenience predicate for the common `mode === "shared"` branch. */
export function usesSharedHooks(raw: string | undefined | null): boolean {
  return resolveHooksMode(raw) === "shared";
}
