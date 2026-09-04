/**
 * Purge expired course gists (issue #155 — 48h ephemeral snippet sharing).
 *
 * Reads expired rows from `course_gists`, best-effort-deletes the
 * corresponding GitHub gist using the student's stored `github_token`
 * (from `course_gist_secrets`), then cascades the Supabase row (the FK
 * constraint on `course_gist_secrets.gist_id` removes the secret too).
 *
 * Behaviour:
 *   - If the user's GitHub token has been revoked/rotated, DELETE /gists/…
 *     will fail; the script still PURGES the Supabase row so it stops
 *     surfacing in the dashboard. We do NOT retry forever, matching the
 *     issue's "best-effort" fallback.
 *   - If the network to Supabase fails mid-way, the script exits non-zero
 *     so the GH Actions job fails and can be re-run.
 *
 * Env:
 *   SUPABASE_URL                       (required)
 *   SUPABASE_SERVICE_ROLE_KEY          (required — service-role JWT)
 *   (optional) BATCH_SIZE              (default 200)
 *   (optional) MAX_ITERATIONS          (default 50, safety cap)
 *   (optional) DRY_RUN=1               (read-only; no DELETEs)
 *
 * Run locally:
 *   DRY_RUN=1 pnpm tsx scripts/purge-course-gists.ts
 */

import process from "node:process";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both required (see .env.example for PRIVATE_SUPABASE_SERVICE_KEY)"
  );
  process.exit(2);
}

const BATCH_SIZE = Math.max(1, Number(process.env.BATCH_SIZE ?? 200));
const MAX_ITERATIONS = Math.max(1, Number(process.env.MAX_ITERATIONS ?? 50));
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

interface ExpiredGist {
  id: string;
  gist_id: string;
  course_id: string;
  student_id: string;
  gist_url: string;
  expires_at: string;
}

interface Pkg {
  gist_id: string;
  github_token: string;
}

interface Summary {
  processed: number;
  githubDeleted: number;
  orphaned: number;
  failed: number;
}

/** Supabase PostgREST client (plain fetch; no @supabase/supabase-js needed). */
class PgClient {
  constructor(
    private url: string,
    private key: string
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { apikey: this.key, Authorization: `Bearer ${this.key}`, Accept: "application/json", ...extra };
  }

  /**
   * SELECT rows from a table. `query` is a raw PostgREST query string of
   * `key=value&key2=value2` pairs (the operator, e.g. `lte`, stays intact in
   * the value). Each key/value is percent-encoded individually so the `&`
   * separators survive.
   */
  async select<T>(table: string, query = ""): Promise<T[]> {
    let suffix = "";
    if (query) {
      const pairs = query.split("&").filter(Boolean).map((kv) => {
        const i = kv.indexOf("=");
        const key = i === -1 ? kv : kv.slice(0, i);
        const val = i === -1 ? "" : kv.slice(i + 1);
        return `${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
      });
      suffix = `?${pairs.join("&")}`;
    }
    const res = await fetch(`${this.url}/rest/v1/${table}${suffix}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`SELECT ${table} failed ${res.status}: ${await res.text()}`);
    return (await res.json()) as T[];
  }

  /** DELETE rows where column=value. Returns the number of rows removed. */
  async delete(table: string, column: string, value: string): Promise<number> {
    const suffix = `?${column}=${encodeURIComponent(value)}`;
    const res = await fetch(`${this.url}/rest/v1/${table}${suffix}`, {
      method: "DELETE",
      headers: this.headers({ Accept: "application/json" }),
    });
    if (!res.ok) throw new Error(`DELETE ${table} failed ${res.status}: ${await res.text()}`);
    return (await res.json()) as number;
  }
}

async function deleteGistOnGitHub(githubToken: string, gistId: string): Promise<void> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Tutors purge-course-gists"
    }
  });
  if (!res.ok) {
    // We do not throw — the caller treats this as an orphan.
    throw new Error(`DELETE gist ${gistId} failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function purge(): Promise<Summary> {
  const client = new PgClient(SUPABASE_URL, SERVICE_KEY);
  const summary: Summary = { processed: 0, githubDeleted: 0, orphaned: 0, failed: 0 };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const rows = await client.select<ExpiredGist>("course_gists", `expires_at=lte.${new Date().toISOString()}&select=id,gist_id,course_id,student_id,gist_url,expires_at&order=expires_at.asc&limit=${BATCH_SIZE}`);
    if (rows.length === 0) break;

    if (DRY_RUN) {
      summary.processed += rows.length;
      console.log(`[dry-run] would delete ${rows.length} expired gist(s)`);
      break;
    }

    const ids = rows.map((r) => r.id).join(",");
    const tokens = (await client.select<Pkg>("course_gist_secrets", `gist_id=in.(${ids})&select=gist_id,github_token`)).reduce(
      (m, r) => m.set(r.gist_id, r.github_token),
      new Map<string, string>()
    );

    for (const row of rows) {
      summary.processed++;
      const token = tokens.get(row.id);

      // 1. Best-effort GitHub gist deletion. Failures don't block the
      //    metadata purge (per issue #155's "best-effort" note), they just
      //    count as "orphaned" (gist left on GitHub).
      if (token) {
        try {
          await deleteGistOnGitHub(token, row.gist_id);
          summary.githubDeleted++;
        } catch (e) {
          summary.orphaned++;
          console.warn(
            `[orphan] student=${row.student_id} course=${row.course_id} gist=${row.gist_id}: ${
              (e as Error).message ?? e
            }`
          );
        }
      } else {
        summary.orphaned++;
      }

      // 2. Always purge the Supabase row (cascades to the stored token). If
      //    the Supabase call itself fails we leave the row for the next run.
      try {
        await client.delete("course_gists", "id", row.id);
      } catch (e) {
        summary.failed++;
        console.error(
          `purge-error [student=${row.student_id} course=${row.course_id} gist=${row.gist_id}]: ${
            (e as Error).message ?? e
          }`
        );
      }
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return summary;
}

function logSummary(s: Summary): void {
  console.log(`purge-course-gists (mode=${DRY_RUN ? "dry-run" : "live"})`);
  console.log(`  processed:        ${s.processed}`);
  console.log(`  github-deleted:   ${s.githubDeleted}`);
  console.log(`  orphaned (no token, best-effort): ${s.orphaned}`);
  console.log(`  failed:           ${s.failed}`);
}

async function main(): Promise<void> {
  const started = Date.now();
  const summary = await purge();
  logSummary(summary);
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (summary.failed > 0 && summary.processed > 0 && summary.failed >= summary.processed) {
    throw new Error("All processed rows failed; see logs above");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
