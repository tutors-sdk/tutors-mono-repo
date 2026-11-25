/**
 * The authorisation matrix (runway tier F; Rules 0621 and 0622). Every server endpoint the apps declare, asked as
 * every role, answers the status the matrix commits to. tests/security/mutating-routes.txt says who may change state;
 * this says, for every route and every role, what they get back, and the E2E stack proves it against the built images
 * (tests/e2e-stack/journeys/authorisation.journey.spec.ts). It is ESI.ts's role matrix
 * (lgriffin/ESI.ts tests/security/authorisation-matrix) on this repo's routes and roles.
 *
 *   tests/e2e-stack/authorisation/matrix.json      one entry per endpoint: the request to send, the status per role
 *   tests/e2e-stack/authorisation/known-gaps.txt   cells that answer something other than the matrix today (shrink-only)
 *
 * The matrix is checked for completeness without the stack: a route file's endpoint missing from it, or an entry whose
 * route is gone, or a role left without an expected status, fails `pnpm test:bdd` (Rule 0622; the routes come from
 * `discoverEndpoints` in security.ts). This module imports nothing, so the Playwright journey can load it as well.
 */

export const AUTHORISATION_MATRIX_PATH = "tests/e2e-stack/authorisation/matrix.json";
export const AUTHORISATION_GAPS_PATH = "tests/e2e-stack/authorisation/known-gaps.txt";

/**
 * Who asks. `anonymous` has no session; `student`, `enrolled` and `lecturer` are signed in through the identity stub
 * (the signed-in course lists `enrolled` and names `lecturer` an educator); `operator` presents the stack's
 * METRICS_TOKEN as a bearer token and no session.
 */
export const ROLES = ["anonymous", "student", "enrolled", "lecturer", "operator"] as const;
export type Role = (typeof ROLES)[number];
export const SIGNED_IN_ROLES: readonly Role[] = ["student", "enrolled", "lecturer"];

export interface MatrixEntry {
  /** `<app> <METHOD> <route id>`, as tests/security/mutating-routes.txt writes it. */
  key: string;
  /** Mounted by a hook (Better Auth) rather than a route file, so discovery cannot see it. */
  hook?: boolean;
  /** What to send: a concrete path for the route id, and a JSON body for a write. */
  request: { path: string; body?: unknown };
  /** Status per role; `*` covers every role not named. */
  expect: Partial<Record<Role | "*", number>>;
  why?: string;
}

export interface Matrix {
  entries: MatrixEntry[];
}

export const parseMatrix = (text: string): Matrix => JSON.parse(text) as Matrix;

export function expectedStatus(entry: MatrixEntry, role: Role): number | undefined {
  return entry.expect[role] ?? entry.expect["*"];
}

/** An entry's app, method and route id. */
export function splitKey(key: string): { app: string; method: string; route: string } {
  const [app = "", method = "", ...route] = key.split(" ");
  return { app, method, route: route.join(" ") };
}

/** What makes the matrix incomplete or stale against the endpoints the apps declare. */
export function matrixFindings(endpoints: { app: string; method: string; route: string }[], matrix: Matrix): string[] {
  const findings: string[] = [];
  const declared = new Set(endpoints.map((e) => `${e.app} ${e.method} ${e.route}`));
  const listed = new Map<string, MatrixEntry>();
  for (const entry of matrix.entries) {
    if (listed.has(entry.key)) findings.push(`duplicate: ${entry.key}`);
    listed.set(entry.key, entry);
    if (!entry.hook && !declared.has(entry.key)) findings.push(`stale: ${entry.key} is in the matrix but no route file declares it`);
    for (const role of ROLES) {
      if (expectedStatus(entry, role) === undefined) findings.push(`unanswered: ${entry.key} has no expected status for ${role}`);
    }
    if (!entry.request?.path?.startsWith("/")) findings.push(`no request: ${entry.key} needs a concrete request path`);
  }
  for (const key of declared) {
    if (!listed.has(key)) findings.push(`unlisted: ${key} has no row in ${AUTHORISATION_MATRIX_PATH}; say what each role gets`);
  }
  return findings.sort();
}

export interface KnownGap {
  key: string;
  role: Role;
  /** What the route answers today. */
  got: number;
  why: string;
}

/** `time POST /api/sync | anonymous | got 400 | why: ...`, one cell per line. */
export function parseGaps(text: string): KnownGap[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const [key = "", role = "", got = "", ...rest] = line.split("|").map((part) => part.trim());
      return { key, role: role as Role, got: Number(got.replace(/^got\s+/, "")), why: rest.join("|").replace(/^why:\s*/, "") };
    });
}

export interface Observation {
  key: string;
  role: Role;
  status: number;
}

/**
 * The cells that fail: a status the matrix does not expect and no gap explains, and a gap that no longer occurs (the
 * route now answers something else, so the line must go: the file only shrinks).
 */
export function cellFindings(observations: Observation[], matrix: Matrix, gaps: KnownGap[]): string[] {
  const entries = new Map(matrix.entries.map((e) => [e.key, e]));
  const findings: string[] = [];
  for (const gap of gaps) {
    if (!ROLES.includes(gap.role) || !Number.isInteger(gap.got) || !gap.why) findings.push(`malformed gap: ${gap.key} | ${gap.role}`);
    if (!entries.has(gap.key)) findings.push(`stale gap: ${gap.key} is not in the matrix`);
  }
  for (const seen of observations) {
    const entry = entries.get(seen.key);
    if (!entry) continue;
    const want = expectedStatus(entry, seen.role);
    const gap = gaps.find((g) => g.key === seen.key && g.role === seen.role);
    if (gap) {
      if (seen.status !== gap.got) findings.push(`stale gap: ${seen.key} as ${seen.role} now answers ${seen.status}, not ${gap.got}; remove the line from ${AUTHORISATION_GAPS_PATH}`);
    } else if (seen.status !== want) {
      findings.push(`unexpected: ${seen.key} as ${seen.role} answered ${seen.status}, the matrix says ${want}`);
    }
  }
  return findings;
}
