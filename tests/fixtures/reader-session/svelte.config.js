import { fileURLToPath } from "node:url";
import { createSvelteConfig } from "../../../packages/svelte/app-config/src/svelte.js";

export default createSvelteConfig({ kit: {
  env: { dir: fileURLToPath(new URL("../../../", import.meta.url)) },
  files: {
    hooks: { server: fileURLToPath(new URL("../../../apps/reader/src/hooks.server", import.meta.url)) },
    lib: fileURLToPath(new URL("../../../apps/reader/src/lib", import.meta.url))
  }
} });
