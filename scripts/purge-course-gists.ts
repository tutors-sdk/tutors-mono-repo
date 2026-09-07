/**
 * Purge expired course snippets (issue #155 — 48h ephemeral snippet sharing).
 *
 * Snippets live entirely in Supabase, so expiry is a row delete and nothing
 * else. There is no GitHub call, no stored access token, and therefore no
 * "orphaned on GitHub" failure mode — an earlier revision of this feature
 * stored snippets as gists and had to best-effort delete them with the
 * student's OAuth token.
 *
 * Reads are already filtered on `expires_at > now()`, so an expired snippet is
 * invisible well before this job removes it. This job reclaims the storage.
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

interface ExpiredSnippet {
  id: string;
  course_id: string;
  student_id: string;
  expires_at: string;
}

interface Summary {
  processed: number;
  deleted: number;
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

  /** DELETE rows where column matches a PostgREST filter value. */
  async delete(table: string, column: string, value: string): Promise<void> {
    const suffix = `?${column}=${encodeURIComponent(value)}`;
    const res = await fetch(`${this.url}/rest/v1/${table}${suffix}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`DELETE ${table} failed ${res.status}: ${await res.text()}`);
  }
}

async function purge(): Promise<Summary> {
  const client = new PgClient(SUPABASE_URL, SERVICE_KEY);
  const summary: Summary = { processed: 0, deleted: 0, failed: 0 };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const rows = await client.select<ExpiredSnippet>(
      "course_gists",
      `expires_at=lte.${new Date().toISOString()}&select=id,course_id,student_id,expires_at&order=expires_at.asc&limit=${BATCH_SIZE}`
    );
    if (rows.length === 0) break;

    if (DRY_RUN) {
      summary.processed += rows.length;
      console.log(`[dry-run] would delete ${rows.length} expired snippet(s)`);
      break;
    }

    // One request per batch rather than per row — `in.(…)` keeps the job cheap
    // when a large cohort's snippets all expire together.
    const ids = rows.map((r) => r.id).join(",");
    summary.processed += rows.length;
    try {
      await client.delete("course_gists", "id", `in.(${ids})`);
      summary.deleted += rows.length;
    } catch (e) {
      summary.failed += rows.length;
      console.error(`purge-error [batch of ${rows.length}]: ${(e as Error).message ?? e}`);
      // Stop rather than spin on a batch that will fail identically next loop.
      break;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return summary;
}

function logSummary(s: Summary): void {
  console.log(`purge-course-gists (mode=${DRY_RUN ? "dry-run" : "live"})`);
  console.log(`  processed: ${s.processed}`);
  console.log(`  deleted:   ${s.deleted}`);
  console.log(`  failed:    ${s.failed}`);
}

async function main(): Promise<void> {
  const started = Date.now();
  const summary = await purge();
  logSummary(summary);
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (summary.failed > 0) {
    throw new Error("Some rows could not be purged; see logs above");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
