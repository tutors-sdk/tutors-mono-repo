import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';

// SVELTEKIT_ADAPTER=node produces a self-contained Node server (build/index.js)
// for the container image. Anything else keeps adapter-auto, which detects the
// hosting platform (Netlify) at build time.
const adapter = process.env.SVELTEKIT_ADAPTER === 'node' ? adapterNode() : adapterAuto();
// SvelteKit names each build after Date.now() unless told otherwise, which makes
// two builds of one commit differ (/_app/version.json, the client bundle and the
// __sveltekit_<hash> global in every page). The Dockerfile passes the commit.
const gitSha = process.env.GIT_SHA && process.env.GIT_SHA !== 'unknown' ? process.env.GIT_SHA : undefined;
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
    ...(gitSha ? { version: { name: gitSha } } : {}),
    env: { dir: '../..' }
  }
};

export default config;
