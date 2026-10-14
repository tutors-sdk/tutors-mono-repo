/**
 * The anonymous reader's adapters, exactly as its composition root builds them: courses are fetched
 * over HTTP and rendered with the real markdown renderer, the clock honours the harness seam, and
 * nothing is recorded, nobody is present and sign-in does not exist. A test of a svelte-state
 * service that loads or decorates courses installs this first; the service itself reads no
 * environment and composes nothing.
 */
import { configureAdapters, type Adapters } from "../../packages/adapters/driving/svelte-state/src/adapters.ts";
import { composeReader } from "../../apps/reader/src/lib/compose.ts";

export function anonymousReader(): Adapters {
  return configureAdapters(composeReader({ PUBLIC_ANON_MODE: "TRUE" }));
}
