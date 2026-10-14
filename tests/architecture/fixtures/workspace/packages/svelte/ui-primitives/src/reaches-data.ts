// Violates ui-primitives-no-data-features: a primitive reading permissions itself.
import { rbac } from "@tutors/svelte-state/rbac";
export const lockedIcon = rbac;
