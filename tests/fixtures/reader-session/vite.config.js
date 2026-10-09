import { fileURLToPath } from "node:url";
import { createViteConfig } from "../../../packages/svelte/app-config/src/vite.js";

export default createViteConfig(import.meta.url, {}, {
  env: { dir: fileURLToPath(new URL("../../../", import.meta.url)) },
  files: {
    hooks: { server: fileURLToPath(new URL("../../../apps/reader/src/hooks.server", import.meta.url)) }
  }
});
