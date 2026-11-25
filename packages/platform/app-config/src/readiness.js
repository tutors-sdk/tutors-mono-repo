/**
 * The readiness answer every app gives at /healthz, decided in one place.
 *
 * Each app's route gathers its own facts (the environment contract, and whichever backing services it
 * uses) and passes them here; this file turns them into the status and the body, so four apps cannot
 * drift apart on what "ready" means:
 *
 *   misconfigured, 503   the environment lacks a variable the app needs (Rule 0684), or a dependency
 *                        rejected the app's credentials (Rule 0690). Restarting will not help; the
 *                        deployment is wrong, so the platform must not route traffic to it.
 *   degraded, 200        the deployment is right but a dependency did not answer (Rule 0616). The app
 *                        still serves what it can, so it stays in rotation.
 *   ok, 200              everything answered, or was skipped because this deployment does not use it.
 *
 * Pure: no clock, no network, no environment. The caller passes the timestamp.
 */

/** @typedef {{ status: string }} Check Any object with a status; the rest of it is passed through to the body. */

/**
 * @param {{
 *   app: string,
 *   timestamp: string,
 *   environment: Check,
 *   dependencies?: Record<string, Check>,
 *   errors?: unknown
 * }} facts `dependencies` is listed in the body after `environment`, in the order given.
 * @returns {{ status: 200 | 503, body: { status: "ok" | "degraded" | "misconfigured", timestamp: string, app: string, checks: Record<string, Check>, errors: { last60min: unknown } } }}
 */
export function readinessReport({ app, timestamp, environment, dependencies = {}, errors }) {
  const checks = Object.values(dependencies);
  const ready = environment.status === 'ok' && checks.every((check) => check.status !== 'rejected');
  const answering = checks.every((check) => check.status === 'ok' || check.status === 'skipped');
  return {
    status: ready ? 200 : 503,
    body: {
      status: !ready ? 'misconfigured' : answering ? 'ok' : 'degraded',
      timestamp,
      app,
      checks: { environment, ...dependencies },
      errors: { last60min: errors }
    }
  };
}
