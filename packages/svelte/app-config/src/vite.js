import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, mergeConfig } from 'vite';

// Workspace packages that ship uncompiled .ts/.svelte source, so Vite has to
// bundle them into the server build rather than leave them as external imports.
const NO_EXTERNAL = [
  '@tutors/course',
  '@tutors/themes',
  '@tutors/i18n',
  '@tutors/community',
  '@tutors/connect',
  '@tutors/runes',
  '@tutors/logger',
  '@tutors/a11y'
];

/**
 * The Vite config every Tutors app shares: APP_VERSION from the app's own
 * package.json, the Tailwind and SvelteKit plugins, and the SSR bundling list.
 *
 * @param {string} appUrl the calling config's `import.meta.url`, used to find the app's package.json
 * @param {import('vite').UserConfig} [overrides] merged over the base with Vite's `mergeConfig` (arrays concatenate)
 * @returns {import('vite').UserConfig}
 */
export function createViteConfig(appUrl, overrides = {}) {
  const file = fileURLToPath(new URL('package.json', appUrl));
  const pkg = JSON.parse(readFileSync(file, 'utf8'));

  return defineConfig(
    mergeConfig(
      {
        define: {
          APP_VERSION: JSON.stringify(pkg.version)
        },
        plugins: [tailwindcss(), sveltekit()],
        ssr: {
          noExternal: NO_EXTERNAL
        }
      },
      overrides
    )
  );
}
