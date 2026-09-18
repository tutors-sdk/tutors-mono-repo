import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * The SvelteKit config every Tutors app shares.
 *
 * @param {import('@sveltejs/kit').Config} [overrides] top-level keys replace the base; `kit` is merged key by key
 * @returns {import('@sveltejs/kit').Config}
 */
export function createSvelteConfig(overrides = {}) {
  // SVELTEKIT_ADAPTER=node produces a self-contained Node server (build/index.js)
  // for the container image. Anything else keeps adapter-auto, which detects the
  // hosting platform (Netlify) at build time.
  const adapter = process.env.SVELTEKIT_ADAPTER === 'node' ? adapterNode() : adapterAuto();

  return {
    preprocess: vitePreprocess(),

    onwarn(warning, defaultHandler) {
      // Ignore state_referenced_locally warning globally
      // These are Svelte 5 best practice warnings about reactivity
      // The code works correctly but could be improved by using $derived/$effect
      if (warning.code === 'state_referenced_locally') return;
      defaultHandler(warning);
    },

    ...overrides,

    kit: {
      adapter,
      ...overrides.kit
    }
  };
}
