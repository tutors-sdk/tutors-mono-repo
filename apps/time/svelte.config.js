import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  onwarn(warning, defaultHandler) {
    if (warning.code === "state_referenced_locally") return;
    defaultHandler(warning);
  },

  kit: {
    adapter: adapter()
  }
};

export default config;
