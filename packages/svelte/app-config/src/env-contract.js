/**
 * The environment contract: every variable a Tutors app reads through `$app/env`, and, for each app,
 * whether a deployment needs it. One table, read by four things:
 *
 *   - env.js declares these variables to SvelteKit (so code can only read a variable listed here);
 *   - each app's server `init` logs one error naming any required variable that is missing (Rule 0683);
 *   - each app's readiness route /healthz answers 503 naming them, so a Kubernetes rollout stops on the
 *     old pods instead of serving a broken release (Rule 0684);
 *   - `pnpm check:env` fails a Netlify production build that lacks one (Rule 0686) and, in CI, fails a
 *     pull request whose code, .env.example or Kubernetes overlays drift from this table (Rules 0687-0689).
 *
 * Release 17.1.0 added PRIVATE_SUPABASE_SERVICE_ROLE_KEY and PRIVATE_API_ALLOWED_ORIGINS to the reader.
 * Both were declared optional, so a deployment without them started cleanly and answered 503 on /api.
 * A variable a new feature cannot work without is "required" or "signed-in" here, never "optional".
 *
 * Levels, per app:
 *   required   needed in every deployment.
 *   signed-in  needed unless PUBLIC_ANON_MODE=TRUE (Rule 0685): anonymous mode runs without Supabase and sign-in.
 *   optional   the app runs without it: a default applies, or the feature it switches on stays off.
 *
 * Adding a variable: add it here with the apps that read it, then add it to .env.example,
 * deploy/staging/.env.example and, for each app that does not treat it as optional, that app's
 * Kubernetes overlay (a ConfigMap entry, or a key in its secrets.yaml.example). `pnpm check:env` says what is missing.
 */

/** @typedef {'reader' | 'catalogue' | 'live' | 'time'} App */
/** @typedef {'required' | 'signed-in' | 'optional'} Level */
/** @typedef {{ public?: boolean, secret?: boolean, apps: Partial<Record<App, Level>> }} Variable */

/** @type {readonly App[]} */
export const APPS = ['reader', 'catalogue', 'live', 'time'];

/** @param {Level} level @returns {Record<App, Level>} */
const everyApp = (level) => ({ reader: level, catalogue: level, live: level, time: level });

/** @type {Readonly<Record<string, Variable>>} */
export const ENV_CONTRACT = {
  PUBLIC_ANON_MODE: { public: true, apps: everyApp('optional') },
  PUBLIC_SUPABASE_URL: { public: true, apps: everyApp('signed-in') },
  PUBLIC_SUPABASE_ANON_KEY: { public: true, apps: everyApp('signed-in') },
  PUBLIC_PDF_KEY: { public: true, apps: everyApp('optional') },
  // Cross-app links; each defaults to the production host (packages/svelte/ui-primitives/src/utils/site-urls.ts).
  PUBLIC_READER_ORIGIN: { public: true, apps: everyApp('optional') },
  PUBLIC_CATALOGUE_ORIGIN: { public: true, apps: everyApp('optional') },
  PUBLIC_LIVE_ORIGIN: { public: true, apps: everyApp('optional') },
  PUBLIC_TIME_ORIGIN: { public: true, apps: everyApp('optional') },
  PRIVATE_AUTH_GITHUB_ID: { secret: true, apps: { reader: 'signed-in' } },
  PRIVATE_AUTH_GITHUB_SECRET: { secret: true, apps: { reader: 'signed-in' } },
  PRIVATE_AUTH_SECRET: { secret: true, apps: { reader: 'signed-in' } },
  // Without it every authenticated /api route answers 503 (17.1.0).
  PRIVATE_SUPABASE_SERVICE_ROLE_KEY: { secret: true, apps: { reader: 'signed-in' } },
  // Without it the time dashboard's requests to the reader's /api/time are refused by CORS (17.1.0).
  PRIVATE_API_ALLOWED_ORIGINS: { apps: { reader: 'signed-in' } },
  PRIVATE_COURSE_HOSTS: { apps: { reader: 'optional' } },
  PRIVATE_TUTORS_ADMINS: { apps: { reader: 'optional' } },
  // Defaults to https://tutors.dev (apps/time/src/lib/time-source.ts).
  PUBLIC_READER_URL: { public: true, apps: { time: 'optional' } },
  // The educator Moodle sync is off without a URL and token.
  MOODLE_WS_URL: { apps: { reader: 'optional' } },
  MOODLE_WS_TOKEN: { secret: true, apps: { reader: 'optional' } },
  MOODLE_WS_REST_FORMAT: { apps: { reader: 'optional' } },
  SYNC_INTERVAL_MINUTES: { apps: { reader: 'optional' } }
};

/** @param {string | undefined} value */
const isSet = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Whether these values run the app anonymously: PUBLIC_ANON_MODE is exactly TRUE. The Supabase client, presence
 * and connect compare the exact string, so "true" or " TRUE" is not anonymous for them, and must not excuse the
 * sign-in variables here either.
 * @param {Record<string, string | undefined>} values
 */
export function isAnonymous(values) {
  return values.PUBLIC_ANON_MODE === 'TRUE';
}

/**
 * The variables `app` needs in a deployment with these values: every "required" one, and the
 * "signed-in" ones unless the values turn anonymous mode on. Sorted by name.
 * @param {App} app
 * @param {Record<string, string | undefined>} values
 * @returns {string[]}
 */
export function requiredVariables(app, values) {
  const anonymous = isAnonymous(values);
  return Object.entries(ENV_CONTRACT)
    .filter(([, v]) => v.apps[app] === 'required' || (v.apps[app] === 'signed-in' && !anonymous))
    .map(([name]) => name)
    .sort();
}

/**
 * The variables `app` needs that are unset or blank in `values`. Names only, never values.
 * @param {App} app
 * @param {Record<string, string | undefined>} values
 * @returns {string[]}
 */
export function missingVariables(app, values) {
  return requiredVariables(app, values).filter((name) => !isSet(values[name]));
}

/**
 * The readiness check's view of the environment: "ok", or "missing" with the names (Rule 0684).
 * @param {App} app
 * @param {Record<string, string | undefined>} values
 * @returns {{ status: 'ok' | 'missing', missing: string[] }}
 */
export function checkEnvironment(app, values) {
  const missing = missingVariables(app, values);
  return { status: missing.length === 0 ? 'ok' : 'missing', missing };
}

