import { env } from "$env/dynamic/public";
import { usesSharedHooks } from "@tutors/hooks/mode";
import { initClientErrorHandling, createClientErrorHandler } from "@tutors/hooks/client";
import * as legacy from "./legacy-hooks.client";

// PUBLIC_TUTORS_HOOKS_MODE picks the shared @tutors/hooks implementation or this
// app's original inline hooks. See packages/svelte/utils/hooks/README.md.
const shared = usesSharedHooks(env.PUBLIC_TUTORS_HOOKS_MODE);

if (shared) {
  initClientErrorHandling("tutors-catalogue");
} else {
  legacy.init();
}

export const handleError = shared ? createClientErrorHandler() : legacy.handleError;
