import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const file = fileURLToPath(new URL('package.json', import.meta.url));
const json = readFileSync(file, 'utf8');
const pkg = JSON.parse(json);

export default defineConfig({
  define: {
    APP_VERSION: JSON.stringify(pkg.version)
  },
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    noExternal: ['@tutors/course', '@tutors/themes', '@tutors/i18n', '@tutors/community', '@tutors/connect', '@tutors/runes', '@tutors/logger', '@tutors/a11y']
  }
});
