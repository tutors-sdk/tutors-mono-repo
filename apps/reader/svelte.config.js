import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  onwarn(warning, defaultHandler) {
    // Ignore state_referenced_locally warning globally
    // These are Svelte 5 best practice warnings about reactivity
    // The code works correctly but could be improved by using $derived/$effect
    if (warning.code === "state_referenced_locally") return;
    defaultHandler(warning);
  },

  kit: {
    // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
    // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
    // See https://svelte.dev/docs/kit/adapters for more information about adapters.
    adapter: adapter()
  }
};

export default config;
