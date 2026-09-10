import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const file = fileURLToPath(new URL('package.json', import.meta.url));
const json = readFileSync(file, 'utf8');
const pkg = JSON.parse(json);

/**
 * Headers for the code run-time, in dev and preview.
 *
 * The run-time is framed with `sandbox="allow-scripts"`, so it lives on an opaque origin
 * and every request it makes for its own assets — the worker, Pyodide, the TypeScript
 * compiler — is a cross-origin request. Hence the allow-origin header.
 *
 * The policy is the frame's own, not the reader's. Inside it `'self'` matches nothing (an
 * opaque origin is not a URL), and running student code is the entire purpose, so it
 * permits eval and WebAssembly. What makes that safe is where it applies: a document with
 * no cookies, no storage and no way back into the reader.
 *
 * `netlify.toml` carries the same rules for production, where these files are served by
 * the CDN rather than by this server.
 */
function runtimeAssetHeaders(): Plugin {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': [
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: https: http://localhost:* http://127.0.0.1:*",
      "worker-src blob:",
      "connect-src blob: data: https: http://localhost:* http://127.0.0.1:*",
      "style-src 'unsafe-inline'",
      "img-src data: blob:"
    ].join('; ')
  };

  type Request = { url?: string };
  type Response = { setHeader: (key: string, value: string) => void };
  type Server = { httpServer: { prependListener: (event: 'request', listener: (request: Request, response: Response) => void) => void } | null };

  const apply = (request: Request, response: Response) => {
    if (!request.url?.startsWith('/runtimes/')) return;
    Object.entries(headers).forEach(([key, value]) => response.setHeader(key, value));
  };

  /**
   * Hooked onto the HTTP server rather than added as a middleware, because Vite serves
   * `static/` from a middleware of its own that runs ahead of every plugin's — a middleware
   * here would see the 404s and none of the files this is about.
   */
  const listen = (server: Server) => server.httpServer?.prependListener('request', apply);

  return {
    name: 'tutors-runtime-asset-headers',
    configureServer(server) {
      listen(server as unknown as Server);
    },
    configurePreviewServer(server) {
      listen(server as unknown as Server);
    }
  };
}

export default defineConfig({
  define: {
    APP_VERSION: JSON.stringify(pkg.version)
  },
  plugins: [sveltekit(), tailwindcss(), runtimeAssetHeaders()],
  ssr: {
    noExternal: ['@tutors/course', '@tutors/themes', '@tutors/i18n', '@tutors/community', '@tutors/connect', '@tutors/runes', '@tutors/logger', '@tutors/a11y', '@tutors/runtime']
  }
});
