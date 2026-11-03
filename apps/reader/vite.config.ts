import { createViteConfig } from '@tutors/app-config/vite';

export default createViteConfig(import.meta.url, {
  // The PDF viewer loads lazily; discovering these later reloads other open pages during UI tests.
  // They belong to @tutors/ui-components, so they are named through it: bare specifiers do not
  // resolve from this app under pnpm, and Vite skips an include it cannot resolve.
  optimizeDeps: { include: ['@tutors/ui-components > file-saver', '@tutors/ui-components > pdfjs-dist'] }
});
