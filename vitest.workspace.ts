import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/svelte/course",
  "packages/svelte/runes",
  "packages/svelte/community",
  "packages/svelte/connect",
  "packages/svelte/themes",
  "packages/svelte/ui-primitives",
  "packages/svelte/ui-components",
  "packages/svelte/utils/logger",
  "packages/svelte/utils/a11y",
  "packages/svelte/utils/i18n",
  "apps/reader",
  "apps/catalogue",
  "apps/live"
]);
