import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Where the static build writes its files, relative to the app. */
export const STATIC_OUT = 'build';
/** The page a static host answers every unknown path with. Not index.html, so `/` stays the app's own page. */
export const STATIC_FALLBACK = '200.html';

/**
 * The build identity `GET /version` answers, written as `version.json` beside a static build, which has no
 * server to answer it (Rule 0772). Same shape as @tutors/runtime's versionInfo.
 *
 * @param {{ name: string, version: string }} pkg the app's package.json
 * @param {Record<string, string | undefined>} env
 */
export function staticVersion(pkg, env) {
  return {
    app: pkg.name,
    version: pkg.version,
    revision: env.GIT_SHA?.trim() || 'unknown',
    built: env.BUILD_DATE?.trim() || 'unknown',
    clock: frozenClock(env.HARNESS_NOW) ? 'frozen' : 'system'
  };
}

/** Mirrors @tutors/runtime's clockStatus: frozen only for a valid ISO instant in HARNESS_NOW. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** @param {string | undefined} raw */
function frozenClock(raw) {
  const value = raw?.trim();
  return Boolean(value) && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * SvelteKit's static adapter with a fallback page, so the app is a single-page app any file server can host
 * (Rule 0770). Writes version.json after the files.
 *
 * @returns {import('@sveltejs/kit').Adapter}
 */
export function staticAdapter() {
  const inner = adapterStatic({ pages: STATIC_OUT, assets: STATIC_OUT, fallback: STATIC_FALLBACK, strict: false });
  return {
    ...inner,
    name: 'tutors-static',
    async adapt(builder) {
      await inner.adapt(builder);
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      writeFileSync(join(STATIC_OUT, 'version.json'), `${JSON.stringify(staticVersion(pkg, process.env), null, 2)}\n`);
      builder.log.minor(`Wrote ${STATIC_OUT}/version.json`);
    }
  };
}

/**
 * Which adapter SVELTEKIT_ADAPTER names: `node` for the container image, `static` for a folder of files
 * (Tutors Studio bundles it), anything else adapter-auto (Netlify).
 *
 * @param {string | undefined} name
 */
export function adapterFor(name) {
  if (name === 'node') return adapterNode();
  if (name === 'static') return staticAdapter();
  return adapterAuto();
}

/**
 * The SvelteKit config every Tutors app shares.
 *
 * @param {NonNullable<Parameters<typeof import('@sveltejs/kit/vite').sveltekit>[0]>} [overrides] options replace shared defaults
 * @returns {NonNullable<Parameters<typeof import('@sveltejs/kit/vite').sveltekit>[0]>}
 */
export function createSvelteKitOptions(overrides = {}) {
  // SVELTEKIT_ADAPTER=node produces a self-contained Node server (build/index.js)
  // for the container image; SVELTEKIT_ADAPTER=static a folder of files with no
  // server, built with PUBLIC_ANON_MODE=TRUE. Anything else keeps adapter-auto,
  // which detects the hosting platform (Netlify) at build time.
  const adapter = adapterFor(process.env.SVELTEKIT_ADAPTER);
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

    onwarn(warning, defaultHandler) {
      if (warning.code === 'state_referenced_locally') return;
      defaultHandler(warning);
    },

    adapter,
    ...(buildName ? { version: { name: buildName } } : {}),
    env: { dir: '../..' },
    ...overrides
  };
}
