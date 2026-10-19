/**
 * The data tier (runway tier I; Rules 0626-0628). scripts/checks/migrations.ts reads the SQL of supabase/migrations;
 * this runs it. Every migration is applied, in name order, to a real Postgres (PGlite, in process, so it runs with the
 * unit tests and needs no Docker) that starts as production did before the first migration:
 *
 *   tests/data/schema/supabase-baseline.sql        what Supabase provides that the migrations take for granted (roles,
 *                                                  the auth schema, pgcrypto). It is also the inventory of what the
 *                                                  schema needs from Supabase, for whatever replaces it.
 *   tests/data/schema/supabase-legacy-tables.sql   the tables production had before supabase/migrations existed
 *   tests/data/schema/seed.sql                     rows in those tables, which every migration must keep
 *
 * The first two are the release harness's migration-mode fixtures (tutors-release-harness fixtures/migrations); keep
 * them in step. Then the code's own use of the database is checked against the migrated catalogue: every table it
 * names in `.from()` and every function it calls with `.rpc()`, with the argument names it passes, which PostgREST
 * matches by name. What the code uses that no migration creates is listed in tests/data/schema/known-gaps.txt, which
 * may only shrink.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import ts from "typescript";
import { REPO_ROOT, readText, toPosix, walk } from "./lib/repo.ts";
import { MIGRATIONS_DIR } from "./migrations.ts";

export const SCHEMA_FIXTURES_DIR = "tests/data/schema";
export const SCHEMA_GAPS_PATH = `${SCHEMA_FIXTURES_DIR}/known-gaps.txt`;

export interface Migration {
  file: string;
  sql: string;
}

/** supabase/migrations in the order the harness and the Supabase CLI apply them. */
export function repoMigrations(root: string = REPO_ROOT): Migration[] {
  const dir = join(root, MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ file: `${MIGRATIONS_DIR}/${name}`, sql: readFileSync(join(dir, name), "utf8") }));
}

const fixture = (name: string, root: string) => readText(join(root, SCHEMA_FIXTURES_DIR, name));

const booted = new Map<string, Promise<PGlite>>();

/**
 * A database as production was before the first migration: Supabase's baseline, then the legacy tables (and, when
 * `seeded`, their rows). Each call gets its own copy of one booted database, since starting Postgres is the slow part.
 */
export async function legacyDatabase(root: string = REPO_ROOT, { seeded = false } = {}): Promise<PGlite> {
  const key = `${root}\0${seeded}`;
  if (!booted.has(key)) {
    booted.set(
      key,
      (async () => {
        const db = await PGlite.create({ extensions: { pgcrypto } });
        await db.exec(fixture("supabase-baseline.sql", root));
        await db.exec(fixture("supabase-legacy-tables.sql", root));
        if (seeded) await db.exec(fixture("seed.sql", root));
        return db;
      })()
    );
  }
  return (await booted.get(key)!).clone() as Promise<PGlite>;
}

/** Apply migrations in order; the first that fails is reported by file. */
export async function applyMigrations(db: PGlite, migrations: Migration[]): Promise<void> {
  for (const migration of migrations) {
    try {
      await db.exec(migration.sql);
    } catch (cause) {
      throw new Error(`${migration.file}: ${(cause as Error).message}`, { cause });
    }
  }
}

export interface Catalog {
  /** Public tables and their columns. */
  tables: Record<string, string[]>;
  /** Public functions, one entry per overload: its input argument names and how many of them must be passed. */
  functions: Record<string, { args: string[]; required: number }[]>;
}

export async function readCatalog(db: PGlite): Promise<Catalog> {
  const columns = await db.query<{ table_name: string; column_name: string }>(
    "select table_name, column_name from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position"
  );
  const functions = await db.query<{ proname: string; names: string[] | null; modes: string[] | null; nargs: number; ndefaults: number }>(
    "select p.proname, p.proargnames as names, p.proargmodes::text[] as modes, p.pronargs as nargs, p.pronargdefaults as ndefaults from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by p.proname"
  );
  const catalog: Catalog = { tables: {}, functions: {} };
  for (const { table_name, column_name } of columns.rows) (catalog.tables[table_name] ??= []).push(column_name);
  for (const { proname, names, modes, nargs, ndefaults } of functions.rows) {
    // proargnames also names a RETURNS TABLE's columns (mode t) and OUT arguments; PostgREST matches only inputs.
    const args = (names ?? []).filter((_, i) => !modes || ["i", "b", "v"].includes(modes[i]));
    (catalog.functions[proname] ??= []).push({ args, required: nargs - ndefaults });
  }
  return catalog;
}

export interface DataAccess {
  /** Tables named in `.from("…")`, with the files that name them. */
  tables: Record<string, string[]>;
  /** Functions called through `.rpc("…", { … })` (or the reader's recording wrapper), with the argument names passed. */
  functions: Record<string, { args: string[]; file: string }[]>;
}

/** Calls whose first argument names a database function and whose second is its named arguments. */
const RPC_CALLEES = new Set(["rpc", "callRecordingFunction"]);
/** `.from("…")` on these is not a table. */
const NOT_TABLES = new Set(["Array", "Buffer", "Uint8Array"]);

/** The tables and functions one source file uses. */
export function dataAccessIn(file: string, text: string, into: DataAccess = { tables: {}, functions: {} }): DataAccess {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      const name = node.arguments[0].text;
      const callee = node.expression;
      const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : "";
      const receiver = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? callee.expression.text : "";
      if (method === "from" && ts.isPropertyAccessExpression(callee) && !NOT_TABLES.has(receiver)) {
        (into.tables[name] ??= []).includes(file) || into.tables[name].push(file);
      }
      // callRecordingFunction(fn, args) is declared with `fn` as a parameter; only literal names are calls of one.
      if (RPC_CALLEES.has(method)) {
        const args = node.arguments[1];
        const names =
          args && ts.isObjectLiteralExpression(args)
            ? args.properties.map((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : "?"))
            : [];
        (into.functions[name] ??= []).push({ args: names.sort(), file });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return into;
}

const SOURCE = /\.(ts|svelte)$/;
const NOT_PRODUCT = /(^|\/)(node_modules|dist|build|\.svelte-kit|tests?|__tests__|e2e)(\/|$)|\.(test|spec)\.ts$/;

/** Every product source file's use of the database. Svelte files are read for their script. */
export function discoverDataAccess(root: string = REPO_ROOT): DataAccess {
  const access: DataAccess = { tables: {}, functions: {} };
  for (const top of ["apps", "packages"]) {
    for (const path of walk(join(root, top), (name) => SOURCE.test(name))) {
      const file = toPosix(path, root);
      if (NOT_PRODUCT.test(file)) continue;
      let text = readFileSync(path, "utf8");
      if (file.endsWith(".svelte")) text = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
      if (!/\.(from|rpc)\(|callRecordingFunction\(/.test(text)) continue;
      dataAccessIn(file, text, access);
    }
  }
  return access;
}

/** `table: assignments | why: …` or `function: increment_calendar | why: …`, one per line. */
export function parseSchemaGaps(text: string): { kind: "table" | "function"; name: string; why: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const [head = "", ...rest] = line.split("|").map((part) => part.trim());
      const [kind, ...name] = head.split(":").map((part) => part.trim());
      return { kind: kind as "table" | "function", name: name.join(":"), why: rest.join("|").replace(/^why:\s*/, "") };
    });
}

/**
 * What the code uses that the migrated schema lacks: a table, a function, or a function called with argument names no
 * overload declares. A listed gap that the schema now has, or the code no longer uses, is stale: the list only shrinks.
 */
export function accessFindings(access: DataAccess, catalog: Catalog, gaps: ReturnType<typeof parseSchemaGaps>): string[] {
  const findings: string[] = [];
  const gap = (kind: "table" | "function", name: string) => gaps.some((g) => g.kind === kind && g.name === name);
  for (const [table, files] of Object.entries(access.tables)) {
    if (!catalog.tables[table] && !gap("table", table)) findings.push(`missing table: ${table} (used in ${files.join(", ")}) is created by no migration`);
  }
  for (const [name, calls] of Object.entries(access.functions)) {
    const overloads = catalog.functions[name];
    if (!overloads) {
      if (!gap("function", name)) findings.push(`missing function: ${name} (called in ${calls[0].file}) is created by no migration`);
      continue;
    }
    for (const call of calls) {
      // PostgREST picks the overload whose inputs are named by the call: every name declared, every required one given.
      const matches = (o: { args: string[]; required: number }) =>
        call.args.every((a) => o.args.includes(a)) && o.args.slice(0, o.required).every((a) => call.args.includes(a));
      if (!overloads.some(matches)) {
        findings.push(`argument names: ${call.file} calls ${name}(${call.args.join(", ")}) but the schema declares ${overloads.map((o) => `(${o.args.join(", ")})`).join(" or ")}`);
      }
    }
  }
  for (const g of gaps) {
    if (!g.why) findings.push(`malformed gap: ${g.kind}: ${g.name} needs a why`);
    const used = g.kind === "table" ? access.tables[g.name] : access.functions[g.name];
    const present = g.kind === "table" ? catalog.tables[g.name] : catalog.functions[g.name];
    if (!used) findings.push(`stale gap: ${g.kind} ${g.name} is no longer used; remove it from ${SCHEMA_GAPS_PATH}`);
    else if (present) findings.push(`stale gap: a migration now creates ${g.kind} ${g.name}; remove it from ${SCHEMA_GAPS_PATH}`);
  }
  return findings.sort();
}

/** Each table's rows, on the columns it had before, in a stable order: what a migration must leave as it found it. */
export async function readRows(db: PGlite, tables: Record<string, string[]>): Promise<Record<string, string[]>> {
  const rows: Record<string, string[]> = {};
  for (const [table, columns] of Object.entries(tables)) {
    const list = columns.map((c) => `"${c}"`).join(", ");
    const result = await db.query<{ row: string }>(`select row_to_json(t)::text as row from (select ${list} from public."${table}") t order by 1`);
    rows[table] = result.rows.map((r) => r.row);
  }
  return rows;
}

/**
 * Apply each migration to a seeded database and compare the rows it held before, on the columns it had before. A
 * migration that deletes, rewrites or retypes existing data is named with the table it changed.
 */
export async function preservationFindings(db: PGlite, migrations: Migration[]): Promise<string[]> {
  const findings: string[] = [];
  for (const migration of migrations) {
    const { tables } = await readCatalog(db);
    const before = await readRows(db, tables);
    await applyMigrations(db, [migration]);
    const after = await readRows(
      db,
      Object.fromEntries(Object.entries(tables).filter(([table]) => before[table].length > 0))
    ).catch((cause: Error) => ({ error: cause.message }) as const);
    if ("error" in after) {
      findings.push(`${migration.file}: the rows held before can no longer be read (${after.error})`);
      continue;
    }
    for (const table of Object.keys(after)) {
      if (JSON.stringify(after[table]) !== JSON.stringify(before[table])) findings.push(`${migration.file}: changed or removed rows in ${table}`);
    }
  }
  return findings;
}
