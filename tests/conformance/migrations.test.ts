import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { claimCovers, evaluate, layoutFindings, MIGRATIONS_DIR, readClaims, scanMigration, splitStatements } from "../../scripts/checks/migrations.ts";

// The two fixtures mirror tests/fixtures/migrations/{b-bad,b-good} in the release harness.
const BAD = `
-- Contract while a still runs: drops a column a reads, narrows another, adds NOT NULL with no default.
ALTER TABLE app_errors DROP COLUMN user_agent;
ALTER TABLE app_errors ALTER COLUMN context TYPE JSON;
ALTER TABLE app_errors ADD COLUMN tenant TEXT NOT NULL;
DROP INDEX idx_app_errors_level;
`;
const GOOD = `
-- Expand only: a nullable column, an index and a policy. Version a keeps working.
ALTER TABLE app_errors ADD COLUMN IF NOT EXISTS release TEXT;
CREATE INDEX IF NOT EXISTS idx_app_errors_release ON app_errors (release);
CREATE POLICY "anon_update_app_errors" ON app_errors FOR UPDATE TO anon USING (true);
`;

const scopes = (sql: string) => scanMigration("m.sql", sql).map((f) => `${f.kind} ${f.scope}`);

describe("migration check: the committed directory", () => {
  const files = readdirSync(join(REPO_ROOT, MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql"));

  it("names every migration <version>_<snake_case>.sql with a unique version", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(layoutFindings(files)).toEqual([]);
  });

  it("finds nothing destructive in what is committed", () => {
    for (const file of files) {
      const sql = readFileSync(join(REPO_ROOT, MIGRATIONS_DIR, file), "utf8");
      expect(scanMigration(file, sql).filter((f) => f.severity === "error")).toEqual([]);
    }
  });
});

describe("migration check: destructive statements", () => {
  it("flags what the harness's b-bad fixture does", () => {
    expect(scopes(BAD)).toEqual(["drop-column app_errors.user_agent", "change-type app_errors.context", "add-not-null-column app_errors.tenant", "drop-index idx_app_errors_level"]);
  });

  it("passes what the harness's b-good fixture does", () => {
    expect(scopes(GOOD)).toEqual([]);
  });

  it("reads drops, renames and NOT NULL in their common spellings", () => {
    expect(scopes('DROP TABLE IF EXISTS public.old_a, "Old_B" CASCADE;')).toEqual(["drop-table old_a", "drop-table Old_B"]);
    expect(scopes("ALTER TABLE t RENAME COLUMN a TO b;")).toEqual(["rename-column t.a"]);
    expect(scopes("ALTER TABLE t RENAME TO u;")).toEqual(["rename-table t"]);
    expect(scopes("ALTER TABLE t ALTER COLUMN c SET DATA TYPE bigint;")).toEqual(["change-type t.c"]);
    expect(scopes("ALTER TABLE t ALTER c SET NOT NULL;")).toEqual(["set-not-null t.c"]);
    expect(scopes("ALTER TABLE ONLY t ADD c int NOT NULL, DROP COLUMN IF EXISTS d;")).toEqual(["add-not-null-column t.c", "drop-column t.d"]);
    expect(scopes('DROP POLICY IF EXISTS "p one" ON public.t;')).toEqual(["drop-policy t:p one"]);
    expect(scopes("DROP FUNCTION get_error_counts(int);")).toEqual(["drop-function get_error_counts/1"]);
    expect(scopes("DROP FUNCTION f();")).toEqual(["drop-function f/0"]);
    expect(scopes("TRUNCATE TABLE t;")).toEqual(["truncate t"]);
  });

  it("allows additive changes", () => {
    expect(scopes("ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 0;")).toEqual([]);
    expect(scopes("ALTER TABLE t ADD COLUMN c int;")).toEqual([]);
    expect(scopes("ALTER TABLE t ADD CONSTRAINT k CHECK (a > 0);")).toEqual([]);
    expect(scopes("ALTER TABLE t DROP CONSTRAINT k;")).toEqual([]);
    expect(scopes("ALTER TABLE t ALTER COLUMN c DROP NOT NULL;")).toEqual([]);
    expect(scopes("ALTER TABLE t ALTER COLUMN c SET DEFAULT 1;")).toEqual([]);
    expect(scopes("ALTER TABLE t ADD COLUMN c int GENERATED ALWAYS AS IDENTITY NOT NULL;")).toEqual([]);
  });

  it("ignores comments, strings and function bodies", () => {
    const sql = [
      "-- DROP TABLE nope;",
      "/* ALTER TABLE t DROP COLUMN c; */",
      "INSERT INTO t VALUES ('DROP TABLE x; DROP TABLE y');",
      "CREATE FUNCTION f() RETURNS void AS $body$ BEGIN DROP TABLE inside_body; END; $body$ LANGUAGE plpgsql;"
    ].join("\n");
    expect(scopes(sql)).toEqual([]);
    expect(splitStatements(sql)).toHaveLength(2);
  });

  it("reports the line of the statement", () => {
    const [finding] = scanMigration("m.sql", "-- header\n\nALTER TABLE t\n  DROP COLUMN c;\n");
    expect(finding.line).toBe(3);
  });

  it("warns, without failing, on drops the harness does not compare", () => {
    const [finding] = scanMigration("m.sql", "DROP VIEW v;");
    expect(finding.severity).toBe("warn");
    expect(evaluate([{ file: "m.sql", sql: "DROP VIEW v;" }], []).errors).toEqual([]);
  });
});

describe("migration check: claims", () => {
  const claim = (artefact: string, scope: string) => ({ artefact, scope });
  const [column] = scanMigration("m.sql", "ALTER TABLE app_errors DROP COLUMN user_agent;");

  it("fails an unclaimed destructive statement and says how to claim it", () => {
    const { errors } = evaluate([{ file: "m.sql", sql: BAD }], []);
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain('artefact: migration, scope: "app_errors.user_agent"');
  });

  it("accepts a statement a migration claim covers, by name, glob or wildcard artefact", () => {
    expect(claimCovers(claim("migration", "app_errors.user_agent"), column)).toBe(true);
    expect(claimCovers(claim("migration", "app_errors.*"), column)).toBe(true);
    expect(claimCovers(claim("*", "**"), column)).toBe(true);
    expect(claimCovers(claim("dom", "app_errors.user_agent"), column)).toBe(false);
    expect(claimCovers(claim("migration", "other.user_agent"), column)).toBe(false);
    const report = evaluate([{ file: "m.sql", sql: "ALTER TABLE app_errors DROP COLUMN user_agent;" }], [claim("migration", "app_errors.user_agent")]);
    expect(report.errors).toEqual([]);
    expect(report.claimed).toHaveLength(1);
  });

  it("reads claims from a claims file and tolerates a broken one", () => {
    expect(readClaims("claims: []\n")).toEqual([]);
    expect(readClaims('claims:\n  - artefact: migration\n    scope: "t.c"\n    reason: "CHANGELOG 16.4.0: drop c"\n')).toEqual([
      { artefact: "migration", scope: "t.c", reason: "CHANGELOG 16.4.0: drop c" }
    ]);
    expect(readClaims("claims: [")).toEqual([]);
  });
});

describe("migration check: layout rules", () => {
  it("rejects bad names and duplicate versions", () => {
    expect(layoutFindings(["20260901_ok.sql"])).toEqual([]);
    expect(layoutFindings(["Add Users.sql"])[0]).toMatch(/name must be/);
    expect(layoutFindings(["1_x.sql"])[0]).toMatch(/name must be/);
    expect(layoutFindings(["20260901_a.sql", "20260901_b.sql"])[0]).toMatch(/shares its version prefix/);
  });

  it("rejects editing or deleting a merged migration, and a new one that sorts before the newest", () => {
    const existing = ["20260822_create_app_errors.sql", "20260901_expand.sql"];
    const all = [...existing, "20260830_late.sql"];
    expect(layoutFindings(all, existing, [{ status: "M", file: existing[0] }])[0]).toMatch(/never edited/);
    expect(layoutFindings(existing, existing, [{ status: "D", file: existing[0] }])[0]).toMatch(/never deleted/);
    expect(layoutFindings(all, existing, [{ status: "A", file: "20260830_late.sql" }])[0]).toMatch(/must sort after every existing one/);
    expect(layoutFindings([...existing, "20260902_next.sql"], existing, [{ status: "A", file: "20260902_next.sql" }])).toEqual([]);
  });
});
