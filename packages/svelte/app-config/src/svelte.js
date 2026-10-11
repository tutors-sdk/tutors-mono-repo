import { createHash } from 'node:crypto';
import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Kit 2 forwards vitePlugin.onwarn but omits it from PluginOptions; Kit 3 accepts onwarn directly.
/** @typedef {NonNullable<Parameters<typeof import('@sveltejs/kit/vite').sveltekit>[0]> & { vitePlugin?: Pick<import('@sveltejs/vite-plugin-svelte').Options, 'onwarn'> }} SvelteKitOptions */

/**
 * The SvelteKit config every Tutors app shares.
 *
 * @param {SvelteKitOptions} [overrides] options replace shared defaults
 * @returns {SvelteKitOptions}
 */
export function createSvelteKitOptions(overrides = {}) {
  // SVELTEKIT_ADAPTER=node produces a self-contained Node server (build/index.js)
  // for the container image. Anything else keeps adapter-auto, which detects the
  // hosting platform (Netlify) at build time.
  const adapter = process.env.SVELTEKIT_ADAPTER === 'node' ? adapterNode() : adapterAuto();
  // SvelteKit names each build after Date.now() unless told otherwise, which makes
  // two builds of one commit differ (/_app/version.json, the client bundle and the
  // __sveltekit_<hash> global in every page). The Dockerfile passes the commit, and the
  // build is named after a hash of it: the name is served in /_app/version.json and baked
  // into the client bundle, and the commit itself is answered by GET /version only. A Netlify
  // build has no GIT_SHA but is given the commit as COMMIT_REF, so its name says what it was
  // built from too.
  const gitSha = [process.env.GIT_SHA, process.env.COMMIT_REF].find((sha) => sha && sha !== 'unknown');
  const buildName = gitSha ? createHash('sha256').update(gitSha).digest('hex').slice(0, 16) : undefined;

  return {
    preprocess: vitePreprocess(),

    vitePlugin: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'state_referenced_locally') return;
        defaultHandler(warning);
      }
    },

    adapter,
    ...(buildName ? { version: { name: buildName } } : {}),
    env: { dir: '../..' },
    ...overrides
  };
}
