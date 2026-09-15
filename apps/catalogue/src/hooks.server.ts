import { env } from "$env/dynamic/public";
import { usesSharedHooks } from "@tutors/hooks/mode";
import { securityHeaders, createServerErrorHandler } from "@tutors/hooks/server";
import * as legacy from "./legacy-hooks.server";

// PUBLIC_TUTORS_HOOKS_MODE picks the shared @tutors/hooks implementation or this
// app's original inline hooks. See packages/svelte/utils/hooks/README.md.
const shared = usesSharedHooks(env.PUBLIC_TUTORS_HOOKS_MODE);

export const handle = shared ? securityHeaders : legacy.handle;

export const handleError = shared ? createServerErrorHandler() : legacy.handleError;
