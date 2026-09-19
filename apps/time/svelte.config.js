import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';

// SVELTEKIT_ADAPTER=node produces a self-contained Node server (build/index.js)
// for the container image. Anything else keeps adapter-auto, which detects the
// hosting platform (Netlify) at build time.
const adapter = process.env.SVELTEKIT_ADAPTER === 'node' ? adapterNode() : adapterAuto();
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  onwarn(warning, defaultHandler) {
    if (warning.code === "state_referenced_locally") return;
    defaultHandler(warning);
  },

  kit: {
    adapter,
    env: { dir: '../..' }
  }
};

export default config;
