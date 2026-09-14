/**
 * Minimal stand-ins for the SvelteKit `$app/*` virtual modules, which only
 * exist inside a SvelteKit build. Aliased from vitest.config.ts so unit tests
 * can import app code (and libraries such as @auth/sveltekit) that reference
 * them. Individual tests can still `vi.mock` these specifiers for assertions.
 */

/** `$app/environment` */
export const browser = false;
export const dev = true;
export const building = false;
export const version = "test";

/** `$app/navigation` */
export const goto = async (): Promise<void> => {};
export const invalidate = async (): Promise<void> => {};
export const invalidateAll = async (): Promise<void> => {};
export const afterNavigate = (): void => {};
export const beforeNavigate = (): void => {};
export const preloadData = async (): Promise<void> => {};
export const preloadCode = async (): Promise<void> => {};
export const pushState = (): void => {};
export const replaceState = (): void => {};

/** `$app/paths` */
export const base = "";
export const assets = "";
export const resolveRoute = (id: string): string => id;
