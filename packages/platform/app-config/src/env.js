import { defineEnvVars } from '@sveltejs/kit/env';
import { ENV_CONTRACT } from './env-contract.js';

/** @type {{ schema: (value: string | undefined) => string | undefined }} */
const optionalString = { schema: (value) => value };

// Every variable in the environment contract (./env-contract.js), declared dynamic so the same image is
// configurable at startup, even when built without a .env. The schema stays permissive: a missing
// variable is reported by the startup log and /healthz (Rules 0683, 0684), not by a crash.
export const variables = defineEnvVars(
  Object.fromEntries(
    Object.entries(ENV_CONTRACT).map(([name, v]) => [name, v.public ? { ...optionalString, public: true } : optionalString])
  )
);
