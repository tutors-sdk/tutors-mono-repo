import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { claimCovers, contractFor, evaluate, layoutFindings, MIGRATIONS_DIR, readClaims, releasedVersions, scanMigration, splitStatements } from "../../scripts/checks/migrations.ts";

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

  const shipped = readFileSync(join(REPO_ROOT, "tests/conformance/shipped-contract-migrations.txt"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("|")[0].trim());

  it("finds nothing destructive in what is committed, except the contract steps that shipped with a claim", () => {
    const found: string[] = [];
    for (const file of files) {
      const sql = readFileSync(join(REPO_ROOT, MIGRATIONS_DIR, file), "utf8");
      const errors = scanMigration(file, sql).filter((f) => f.severity === "error");
      found.push(...errors.map((f) => `${file} ${f.scope}`));
      expect(errors.filter((f) => !shipped.includes(`${file} ${f.scope}`))).toEqual([]);
    }
    expect(shipped.filter((entry) => !found.includes(entry))).toEqual([]);
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

  // A contract step for a release that is out, so only the claims rule is in play here.
  const released = new Set(["16.2.2"]);
  const header = "-- contract-for: v16.2.2\n";

  it("fails an unclaimed destructive statement and says how to claim it", () => {
    const { errors } = evaluate([{ file: "m.sql", sql: header + BAD }], [], released);
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain('artefact: migration, scope: "app_errors.user_agent"');
  });

  it("accepts a statement a migration claim covers, by name, glob or wildcard artefact", () => {
    expect(claimCovers(claim("migration", "app_errors.user_agent"), column)).toBe(true);
    expect(claimCovers(claim("migration", "app_errors.*"), column)).toBe(true);
    expect(claimCovers(claim("*", "**"), column)).toBe(true);
    expect(claimCovers(claim("dom", "app_errors.user_agent"), column)).toBe(false);
    expect(claimCovers(claim("migration", "other.user_agent"), column)).toBe(false);
    const report = evaluate([{ file: "m.sql", sql: header + "ALTER TABLE app_errors DROP COLUMN user_agent;" }], [claim("migration", "app_errors.user_agent")], released);
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

describe("migration check: a contract step never lands in the release of its expand", () => {
  const claims = [{ artefact: "migration", scope: "*" }];
  const released = releasedVersions("## Reader\n\n### Unreleased\n\n### v16.2.2 (2026-09)\n\n## Time\n\n### v16.2.0 (2026-09)\n");
  const drop = "DROP POLICY p ON t;";

  it("reads the released versions from CHANGELOG.md headings, not the Unreleased section", () => {
    expect([...released].sort()).toEqual(["16.2.0", "16.2.2"]);
  });

  it("reads the release a migration contracts for from its header line", () => {
    expect(contractFor("-- contract-for: v16.2.2\nDROP POLICY p ON t;")).toBe("16.2.2");
    expect(contractFor("-- contract-for: (set when promoting)\n")).toBeNull();
    expect(contractFor(drop)).toBeNull();
  });

  it("fails a claimed contract step that names no release", () => {
    const { errors } = evaluate([{ file: "m.sql", sql: drop }], claims, released);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("contract-for");
  });

  it("fails a contract step for a release that is not out yet: the same release as its expand", () => {
    const { errors } = evaluate([{ file: "m.sql", sql: `-- contract-for: v16.3.0\n${drop}` }], claims, released);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("cannot land in the same release as its expand");
  });

  it("accepts a claimed contract step for a released version", () => {
    expect(evaluate([{ file: "m.sql", sql: `-- contract-for: v16.2.2\n${drop}` }], claims, released).errors).toEqual([]);
  });

  it("counts a DO block that drops or revokes, and a REVOKE from anon, as contract steps", () => {
    const doBlock = "DO $$ BEGIN EXECUTE 'x'; DROP POLICY IF EXISTS p ON t; END $$;";
    expect(scanMigration("m.sql", doBlock).map((f) => f.kind)).toEqual(["opaque-contract"]);
    expect(scanMigration("m.sql", "REVOKE ALL ON TABLE t FROM anon, PUBLIC;").map((f) => f.kind)).toEqual(["revoke"]);
    expect(evaluate([{ file: "m.sql", sql: doBlock }], [], released).errors[0]).toContain("contract-for");
    expect(evaluate([{ file: "m.sql", sql: "REVOKE SELECT ON t FROM authenticated;" }], [], released).errors[0]).toContain("contract-for");
  });

  it("leaves expand-only migrations alone, including a DO block that only creates and a REVOKE from PUBLIC followed by grants", () => {
    const expand = [
      "DO $$ BEGIN EXECUTE 'CREATE POLICY p ON t FOR SELECT TO anon USING (true)'; END $$;",
      "REVOKE ALL ON FUNCTION f(INT) FROM PUBLIC; GRANT EXECUTE ON FUNCTION f(INT) TO anon;",
      "CREATE TABLE IF NOT EXISTS t (id int);"
    ];
    for (const sql of expand) expect(evaluate([{ file: "m.sql", sql }], [], released).errors, sql).toEqual([]);
  });

  it("keeps a written contract step out of supabase/migrations, refusing to run without tutors.contract_ok", () => {
    const dir = join(REPO_ROOT, "supabase/contracts");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, file), "utf8");
      expect(sql, file).toMatch(/current_setting\('tutors\.contract_ok', true\)/);
      // One statement, so the guard's exception stops all of it even in a client that continues on error.
      expect(splitStatements(sql).map((s) => s.text.slice(0, 5).toUpperCase()), file).toEqual(["DO $$"]);
      // Promoted means moved, not copied: the same step must not also be a migration.
      expect(readdirSync(join(REPO_ROOT, MIGRATIONS_DIR)).some((m) => m.endsWith(`_${file}`)), file).toBe(false);
    }
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
