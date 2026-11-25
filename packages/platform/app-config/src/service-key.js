/**
 * Is the reader's PRIVATE_SUPABASE_SERVICE_ROLE_KEY a key Supabase accepts as service_role? Rules 0690, 0691.
 *
 * After release 17.1.0 the key was set on Netlify, but Supabase refused it, so every /api route answered 500.
 * A check for the variable's name passes that deployment. These two checks look at the value:
 *
 *   keyShape   offline: a legacy JWT whose role claim is service_role, or a new-style sb_secret_ key.
 *              The anon key, a publishable key or a pasted fragment fails here.
 *   probeKey   one HEAD request to PostgREST with the key, limit 0, so no rows are read. 401 or 403 means
 *              Supabase refused the key (another project's key, or a rotated one). A network failure or a
 *              5xx is "unreachable": that says Supabase is down, not that the key is wrong.
 *
 * Neither check returns or logs the key.
 */

/** The table the probe reads: /api/me reads it on every signed-in page, so the service role can always reach it. */
const PROBE_TABLE = 'tutors-connect-users';

/**
 * @param {string} segment base64url
 * @returns {unknown}
 */
function decodeJwtPart(segment) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
}

/**
 * Whether the key's own text says it is a service-role key. Offline; the signature is Supabase's to check.
 * @param {string | undefined} key
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function keyShape(key) {
  const value = key?.trim() ?? '';
  if (value.startsWith('sb_secret_')) return { ok: true };
  if (value.startsWith('sb_publishable_')) return { ok: false, reason: 'is a publishable key; the reader needs the secret (service_role) key' };
  const parts = value.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'is neither a JWT nor an sb_secret_ key' };
  let role;
  try {
    role = /** @type {{ role?: unknown }} */ (decodeJwtPart(parts[1] ?? '')).role;
  } catch {
    return { ok: false, reason: 'is not a readable JWT' };
  }
  if (role === 'service_role') return { ok: true };
  return { ok: false, reason: `is a JWT for the ${typeof role === 'string' ? `"${role}"` : 'unknown'} role, not service_role` };
}

/**
 * Ask Supabase whether it accepts the key, reading no rows.
 * @param {{ url: string, key: string, fetch?: typeof fetch, timeoutMs?: number }} options
 * @returns {Promise<{ status: 'ok' } | { status: 'rejected', httpStatus: number } | { status: 'unreachable', message: string }>}
 */
export async function probeKey({ url, key, fetch: fetchImpl = fetch, timeoutMs = 2_000 }) {
  let base = url;
  while (base.endsWith('/')) base = base.slice(0, -1);
  const endpoint = `${base}/rest/v1/${encodeURIComponent(PROBE_TABLE)}?select=github_id&limit=0`;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'HEAD',
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (response.status === 401 || response.status === 403) return { status: 'rejected', httpStatus: response.status };
    if (response.ok) return { status: 'ok' };
    return { status: 'unreachable', message: `Supabase answered ${response.status}` };
  } catch (error) {
    const cause = error instanceof Error ? /** @type {{ cause?: { code?: string } }} */ (error).cause?.code ?? error.name : undefined;
    return { status: 'unreachable', message: cause ?? 'request failed' };
  }
}

/**
 * Both checks, as the readiness route and the build report them. `missing` when there is no key to check.
 * @param {{ url?: string, key?: string, fetch?: typeof fetch, timeoutMs?: number }} options
 * @returns {Promise<{ status: 'ok' | 'missing' | 'rejected' | 'unreachable', message?: string }>}
 */
export async function checkServiceKey({ url, key, fetch: fetchImpl, timeoutMs }) {
  if (!url?.trim() || !key?.trim()) return { status: 'missing' };
  const shape = keyShape(key);
  if (!shape.ok) return { status: 'rejected', message: `PRIVATE_SUPABASE_SERVICE_ROLE_KEY ${shape.reason}` };
  const probe = await probeKey({ url: url.trim(), key: key.trim(), fetch: fetchImpl, timeoutMs });
  if (probe.status === 'rejected') return { status: 'rejected', message: `Supabase refused PRIVATE_SUPABASE_SERVICE_ROLE_KEY (${probe.httpStatus}); it belongs to another project or was rotated` };
  if (probe.status === 'unreachable') return { status: 'unreachable', message: probe.message };
  return { status: 'ok' };
}
