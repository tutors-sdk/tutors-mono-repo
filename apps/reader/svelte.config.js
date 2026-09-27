import { createHash } from 'node:crypto';
import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';

// SVELTEKIT_ADAPTER=node produces a self-contained Node server (build/index.js)
// for the container image. Anything else keeps adapter-auto, which detects the
// hosting platform (Netlify) at build time.
const adapter = process.env.SVELTEKIT_ADAPTER === 'node' ? adapterNode() : adapterAuto();
// SvelteKit names each build after Date.now() unless told otherwise, which makes
// two builds of one commit differ (/_app/version.json, the client bundle and the
// __sveltekit_<hash> global in every page). The Dockerfile passes the commit, and the
// build is named after a hash of it: the name is served in /_app/version.json and baked
// into the client bundle, and the commit itself is answered by GET /version only.
const gitSha = process.env.GIT_SHA && process.env.GIT_SHA !== 'unknown' ? process.env.GIT_SHA : undefined;
const buildName = gitSha ? createHash('sha256').update(gitSha).digest('hex').slice(0, 16) : undefined;
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
    adapter,
    ...(buildName ? { version: { name: buildName } } : {}),
    env: { dir: '../..' }
  }
};

export default config;
