import adapter from '@sveltejs/adapter-auto';
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
    adapter: adapter(),
    csp: {
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline', 'https://cdn.jsdelivr.net'],
        'img-src': ['self', 'data:', 'https:', 'blob:'],
        'font-src': ['self', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
        'connect-src': ['self', 'https:', 'wss://*.partykit.dev'],
        'frame-src': ['https://www.youtube.com', 'https://media.heanet.ie', 'https://vimp.oth-regensburg.de'],
        'media-src': ['self', 'https:'],
        'object-src': ['none'],
        'base-uri': ['self']
      }
    }
  }
};

export default config;
