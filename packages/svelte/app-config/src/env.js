import { defineEnvVars } from '@sveltejs/kit/env';

/** @type {{ schema: (value: string | undefined) => string | undefined }} */
const optionalString = { schema: (value) => value };

// Dynamic declarations keep the same image configurable at startup, even when built without a .env.
export const variables = defineEnvVars({
  PUBLIC_ANON_MODE: { ...optionalString, public: true },
  PUBLIC_SUPABASE_URL: { ...optionalString, public: true },
  PUBLIC_SUPABASE_ANON_KEY: { ...optionalString, public: true },
  PUBLIC_PDF_KEY: { ...optionalString, public: true },
  PUBLIC_READER_ORIGIN: { ...optionalString, public: true },
  PUBLIC_CATALOGUE_ORIGIN: { ...optionalString, public: true },
  PUBLIC_LIVE_ORIGIN: { ...optionalString, public: true },
  PUBLIC_TIME_ORIGIN: { ...optionalString, public: true },
  PRIVATE_AUTH_GITHUB_ID: optionalString,
  PRIVATE_AUTH_GITHUB_SECRET: optionalString,
  PRIVATE_AUTH_SECRET: optionalString,
  MOODLE_WS_URL: optionalString,
  MOODLE_WS_TOKEN: optionalString,
  MOODLE_WS_REST_FORMAT: optionalString,
  SYNC_INTERVAL_MINUTES: optionalString
});
