import { createViteConfig } from '@tutors/app-config/vite';

export default createViteConfig(import.meta.url, {
  // The PDF viewer loads lazily; discovering these later reloads other open pages during UI tests.
  optimizeDeps: { include: ['file-saver', 'pdfjs-dist'] }
});
