/**
 * Expand/contract check for supabase/migrations, the directory the release
 * harness reads (guides/MIGRATIONS.md).
 *
 *   pnpm check:migrations                  # migrations added since the merge base with origin/main (or main)
 *   pnpm check:migrations --base <ref>     # ... since another ref
 *   pnpm check:migrations --all            # treat every migration as new
 *
 * The harness (tutors-sdk/tutors-release-harness, `--mode migration`) applies
 * the deployed version's migrations to a throwaway Postgres, then the ones the
 * candidate adds, and fails on anything version a still reads that is gone or
 * narrower: a dropped or renamed table or column, a changed column type, a new
 * NOT NULL without a default, a removed index, function or policy. That is
 * decided on the real catalogue, which needs Docker and a database. This check
 * reads the SQL instead, so the author hears about it on the PR, and it reads
 * the shape rules the harness cannot see: file names, order, and a merged
 * migration being edited (the harness only applies files a does not have, so an
 * edit to a merged file is invisible to it).
 *
 * A destructive statement is allowed when release/claims.yaml carries a claim
 * `artefact: migration` whose scope matches what it removes: the same claim the
 * harness needs. The scope is what the harness reports: `table`, `table.column`,
 * an index name, `table:policy`, or `function/<argument count>`.
 *
 * A contract step never ships in the release that makes it safe. A migration with
 * a destructive statement (or a DO block that drops or revokes, or a REVOKE from
 * anon or authenticated) must say which release it contracts for, in a header
 * line `-- contract-for: vX.Y.Z`, and that version must already be released: a
 * `### vX.Y.Z` heading in CHANGELOG.md. The code that stops using what the
 * migration removes ships in release N; the migration can only name N once N is
 * out, so it lands in N+1 at the earliest (guides/MIGRATIONS.md).
 *
 * The scan is lexical, not a SQL parser. It knows comments, quoted strings and
 * dollar-quoted bodies, and reads the statements whose effect it can name. What
 * it cannot name (the statements inside a DO block, a type change hidden in a
 * function) is the harness's to catch; a DO block that drops or revokes still
 * counts as a contract step here.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { REPO_ROOT } from "./lib/repo.ts";

export const MIGRATIONS_DIR = "supabase/migrations";

/** `<version>_<snake_case_name>.sql`: a date or timestamp, then what it does. Sorted by name, the way the harness and the Supabase CLI order them. */
export const MIGRATION_NAME = /^\d{8,14}_[a-z0-9][a-z0-9_]*\.sql$/;

export type Kind =
  | "drop-table"
  | "drop-column"
  | "rename-table"
  | "rename-column"
  | "change-type"
  | "set-not-null"
  | "add-not-null-column"
  | "drop-index"
  | "drop-policy"
  | "drop-function"
  | "drop-schema"
  | "truncate"
  | "drop-other"
  | "opaque-contract"
  | "revoke";

export interface Finding {
  file: string;
  line: number;
  kind: Kind;
  /** What the harness would call the hunk: `table`, `table.column`, index name, `table:policy`, `function/<n>`. */
  scope: string;
  /**
   * `error` fails the check unless a claim covers it; `warn` is reported only; `contract` needs no claim
   * (the harness sees its real effect) but makes the file a contract step, bound by the contract-for rule.
   */
  severity: "error" | "warn" | "contract";
  message: string;
}

export interface Claim {
  artefact: string;
  scope: string;
}

export interface Statement {
  text: string;
  line: number;
}

// ---- tokenising ------------------------------------------------------------------------------

/**
 * Split SQL into statements with comments removed and the insides of string
 * literals and dollar-quoted bodies blanked, so a `;` or a `DROP` inside one is
 * not read as SQL. Quoted identifiers are kept.
 */
export function splitStatements(sql: string): Statement[] {
  const out: Statement[] = [];
  let current = "";
  let startLine = 1;
  let line = 1;
  let i = 0;
  const flush = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) out.push({ text, line: startLine });
    current = "";
  };
  const push = (chunk: string) => {
    if (!current.trim() && chunk.trim()) startLine = line;
    current += chunk;
  };
  while (i < sql.length) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      line += (sql.slice(i, stop).match(/\n/g) ?? []).length;
      i = stop;
      push(" ");
    } else if (ch === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      line += (sql.slice(i, j + 1).match(/\n/g) ?? []).length;
      push("''");
      i = j + 1;
    } else if (ch === '"') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== '"') j++;
      push(sql.slice(i, j + 1));
      i = j + 1;
    } else if (ch === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      const end = tag ? sql.indexOf(tag[0], i + tag[0].length) : -1;
      if (tag && end !== -1) {
        const stop = end + tag[0].length;
        line += (sql.slice(i, stop).match(/\n/g) ?? []).length;
        push("$$ $$");
        i = stop;
      } else {
        push(ch);
        i++;
      }
    } else if (ch === ";") {
      flush();
      i++;
    } else {
      if (ch === "\n") line++;
      push(ch);
      i++;
    }
  }
  flush();
  return out;
}

const IDENT = String.raw`(?:"[^"]+"|[a-z_][a-z0-9_$]*)`;
const QUALIFIED = String.raw`(?:${IDENT}\.)?${IDENT}`;

/** `public."Foo"` -> `Foo`; unquoted names fold to lower case, as Postgres does. */
function name(raw: string): string {
  const last = raw.trim().replace(/^.*\.(?=(?:"[^"]+"|[^."]+)$)/, "");
  return last.startsWith('"') ? last.slice(1, -1) : last.toLowerCase();
}

/** Split on commas that are not inside parentheses. */
function topLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function argCount(args: string): number {
  const inner = args.trim().replace(/^\(/, "").replace(/\)$/, "").trim();
  return inner ? topLevelCommas(inner).length : 0;
}

// ---- reading statements ----------------------------------------------------------------------

type Draft = Omit<Finding, "file" | "line">;

function alterTableActions(text: string): Draft[] {
  const head = new RegExp(String.raw`^alter table (?:if exists )?(?:only )?(${QUALIFIED})\s+(.*)$`, "i").exec(text);
  if (!head) return [];
  const table = name(head[1]);
  const drafts: Draft[] = [];
  for (const action of topLevelCommas(head[2])) {
    let m: RegExpExecArray | null;
    if ((m = new RegExp(String.raw`^drop (?:column )?(?:if exists )?(${IDENT})(?:\s|$)`, "i").exec(action)) && !/^drop (constraint|not null|default|identity|expression)\b/i.test(action)) {
      const column = name(m[1]);
      drafts.push({ kind: "drop-column", scope: `${table}.${column}`, severity: "error", message: `drops column ${table}.${column}` });
    } else if ((m = new RegExp(String.raw`^rename (?:column )?(${IDENT}) to (${IDENT})`, "i").exec(action)) && !/^rename constraint\b/i.test(action)) {
      const column = name(m[1]);
      drafts.push({ kind: "rename-column", scope: `${table}.${column}`, severity: "error", message: `renames column ${table}.${column} to ${name(m[2])}` });
    } else if ((m = new RegExp(String.raw`^rename to (${IDENT})`, "i").exec(action))) {
      drafts.push({ kind: "rename-table", scope: table, severity: "error", message: `renames table ${table} to ${name(m[1])}` });
    } else if ((m = new RegExp(String.raw`^alter (?:column )?(${IDENT}) (?:set data )?type\b`, "i").exec(action))) {
      const column = name(m[1]);
      drafts.push({ kind: "change-type", scope: `${table}.${column}`, severity: "error", message: `changes the type of ${table}.${column}` });
    } else if ((m = new RegExp(String.raw`^alter (?:column )?(${IDENT}) set not null\b`, "i").exec(action))) {
      const column = name(m[1]);
      drafts.push({ kind: "set-not-null", scope: `${table}.${column}`, severity: "error", message: `makes ${table}.${column} NOT NULL; version a's inserts fail unless the column has a default` });
    } else if ((m = new RegExp(String.raw`^add (?:column )?(?:if not exists )?(${IDENT}) (.*)$`, "i").exec(action)) && !/^add (constraint|primary|foreign|unique|check|exclude)\b/i.test(action)) {
      const rest = m[2];
      if (/\bnot null\b/i.test(rest) && !/\bdefault\b/i.test(rest) && !/\b(serial|bigserial|smallserial|generated)\b/i.test(rest)) {
        const column = name(m[1]);
        drafts.push({ kind: "add-not-null-column", scope: `${table}.${column}`, severity: "error", message: `adds ${table}.${column} NOT NULL with no default; version a's inserts fail` });
      }
    }
  }
  return drafts;
}

/** The findings of one statement, without file and line. */
export function readStatement(text: string): Draft[] {
  let m: RegExpExecArray | null;
  if (/^alter table\b/i.test(text)) return alterTableActions(text);
  if ((m = /^drop table (?:if exists )?(.*?)(?: cascade| restrict)?$/i.exec(text))) {
    return topLevelCommas(m[1]).map((t) => ({ kind: "drop-table" as const, scope: name(t), severity: "error" as const, message: `drops table ${name(t)}` }));
  }
  if ((m = new RegExp(String.raw`^drop index (?:concurrently )?(?:if exists )?(.*?)(?: cascade| restrict)?$`, "i").exec(text))) {
    return topLevelCommas(m[1]).map((i) => ({ kind: "drop-index" as const, scope: name(i), severity: "error" as const, message: `drops index ${name(i)}` }));
  }
  if ((m = new RegExp(String.raw`^drop policy (?:if exists )?(${IDENT}) on (${QUALIFIED})`, "i").exec(text))) {
    return [{ kind: "drop-policy", scope: `${name(m[2])}:${name(m[1])}`, severity: "error", message: `drops policy ${name(m[1])} on ${name(m[2])}` }];
  }
  if ((m = new RegExp(String.raw`^drop function (?:if exists )?(${QUALIFIED})\s*(\(.*\))?`, "i").exec(text))) {
    const n = argCount(m[2] ?? "()");
    return [{ kind: "drop-function", scope: `${name(m[1])}/${n}`, severity: "error", message: `drops function ${name(m[1])} taking ${n} argument${n === 1 ? "" : "s"}` }];
  }
  if ((m = new RegExp(String.raw`^drop schema (?:if exists )?(${IDENT})`, "i").exec(text))) {
    return [{ kind: "drop-schema", scope: name(m[1]), severity: "error", message: `drops schema ${name(m[1])}` }];
  }
  if ((m = new RegExp(String.raw`^truncate (?:table )?(?:only )?(${QUALIFIED})`, "i").exec(text))) {
    return [{ kind: "truncate", scope: name(m[1]), severity: "error", message: `truncates ${name(m[1])}: version a's reads lose their rows` }];
  }
  if ((m = new RegExp(String.raw`^drop (view|materialized view|type|trigger|extension|sequence|rule|domain) (?:if exists )?(${QUALIFIED})`, "i").exec(text))) {
    return [{ kind: "drop-other", scope: name(m[2]), severity: "warn", message: `drops ${m[1].toLowerCase()} ${name(m[2])} (the harness does not compare it; check version a does not use it)` }];
  }
  return [];
}

/** A DO block's body is blanked by splitStatements; one that drops, revokes or truncates is a contract step whatever it names. */
const OPAQUE_CONTRACT = /\b(?:drop\s+(?:policy|table|column|function|index|schema|view)|revoke|truncate)\b/i;

function opaqueContracts(file: string, sql: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of sql.matchAll(/\bdo\s+(\$[A-Za-z_]*\$)([\s\S]*?)\1/gi)) {
    const body = m[2].replace(/--[^\n]*/g, "");
    if (!OPAQUE_CONTRACT.test(body)) continue;
    const line = sql.slice(0, m.index).split("\n").length;
    findings.push({ kind: "opaque-contract", scope: "do-block", severity: "contract", message: "runs a DO block that drops, revokes or truncates", file, line });
  }
  return findings;
}

/** Destructive statements in one migration file. */
export function scanMigration(file: string, sql: string): Finding[] {
  const statements = splitStatements(sql).flatMap((s) => {
    const drafts = readStatement(s.text);
    const revoke = /^revoke\b.*\bfrom\s+(.*)$/i.exec(s.text);
    if (revoke && /\b(anon|authenticated)\b/i.test(revoke[1])) {
      drafts.push({ kind: "revoke", scope: "grant", severity: "contract", message: "revokes a privilege from anon or authenticated" });
    }
    return drafts.map((d) => ({ ...d, file, line: s.line }));
  });
  return [...statements, ...opaqueContracts(file, sql)].sort((a, b) => a.line - b.line);
}

// ---- contract steps --------------------------------------------------------------------------

/** The release a contract migration names in its `-- contract-for: vX.Y.Z` header, or null. */
export function contractFor(sql: string): string | null {
  return /^--\s*contract-for:\s*v?(\d+\.\d+\.\d+)\s*$/im.exec(sql)?.[1] ?? null;
}

/** Every version CHANGELOG.md records as released: its `### vX.Y.Z` headings, in any app's section. */
export function releasedVersions(changelog: string): Set<string> {
  return new Set([...changelog.matchAll(/^###\s+v(\d+\.\d+\.\d+)\b/gm)].map((m) => m[1]));
}

// ---- claims ----------------------------------------------------------------------------------

function globToRegExp(glob: string): RegExp {
  const source = glob
    .split("**")
    .map((part) => part.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${source}$`, "i");
}

export function claimCovers(claim: Claim, finding: Finding): boolean {
  return (claim.artefact === "migration" || claim.artefact === "*") && globToRegExp(claim.scope.trim()).test(finding.scope);
}

/** Claims from a release/claims.yaml text; an unparseable file contributes none (release-claims reports it). */
export function readClaims(text: string): Claim[] {
  try {
    const doc = yaml.load(text) as { claims?: unknown } | null;
    if (!doc || !Array.isArray(doc.claims)) return [];
    return doc.claims.filter((c): c is Claim => !!c && typeof (c as Claim).artefact === "string" && typeof (c as Claim).scope === "string");
  } catch {
    return [];
  }
}

// ---- file rules ------------------------------------------------------------------------------

export interface Change {
  status: "A" | "M" | "D";
  file: string;
}

/**
 * Rules about the directory rather than the SQL. `existing` is the file names
 * at the base (the deployed side); `all` is every file now. Both are bare names.
 */
export function layoutFindings(all: string[], existing: string[] = [], changes: Change[] = []): string[] {
  const errors: string[] = [];
  const sql = all.filter((f) => f.endsWith(".sql"));
  for (const file of sql) {
    if (!MIGRATION_NAME.test(file)) errors.push(`${file}: name must be <yyyymmdd[hhmmss]>_<snake_case>.sql (lower case, no spaces)`);
  }
  const seen = new Map<string, string>();
  for (const file of sql) {
    const version = file.split("_")[0];
    const other = seen.get(version);
    if (other) errors.push(`${file}: shares its version prefix ${version} with ${other}; two migrations from one day need distinct timestamps`);
    else seen.set(version, file);
  }
  const newest = [...existing].filter((f) => f.endsWith(".sql")).sort().pop();
  for (const change of changes) {
    const file = change.file;
    if (change.status === "M") errors.push(`${file}: a merged migration is never edited. The harness applies only files the deployed version lacks, so the edit would not be rehearsed. Add a new migration instead`);
    else if (change.status === "D") errors.push(`${file}: a merged migration is never deleted or renamed; deployed databases have already run it. Add a new migration instead`);
    else if (newest && file.endsWith(".sql") && file <= newest) errors.push(`${file}: sorts before ${newest}, which is already merged. A new migration must sort after every existing one`);
  }
  return errors;
}

export interface Report {
  errors: string[];
  claimed: string[];
  warnings: string[];
}

/**
 * Everything the check says about the added migrations, given the claims and the versions CHANGELOG.md
 * records as released (for the contract-for rule).
 */
export function evaluate(added: { file: string; sql: string }[], claims: Claim[], released: Set<string> = new Set()): Pick<Report, "errors" | "claimed" | "warnings"> {
  const report = { errors: [] as string[], claimed: [] as string[], warnings: [] as string[] };
  for (const { file, sql } of added) {
    const findings = scanMigration(file, sql);
    if (findings.some((f) => f.severity === "error" || f.severity === "contract")) {
      const version = contractFor(sql);
      if (!version) {
        report.errors.push(
          `${file}: is a contract step (it removes or narrows something) but names no released version. Add a header line "-- contract-for: vX.Y.Z" naming the release whose code no longer needs what it removes; that release must be out before this migration lands (guides/MIGRATIONS.md)`
        );
      } else if (!released.has(version)) {
        report.errors.push(
          `${file}: contracts for v${version}, which CHANGELOG.md does not record as released. A contract step cannot land in the same release as its expand: move it to a release after v${version} ships (guides/MIGRATIONS.md)`
        );
      }
    }
    for (const f of findings) {
      const where = `${file}:${f.line}: ${f.message} [${f.scope}]`;
      if (f.severity === "warn") report.warnings.push(where);
      else if (f.severity === "contract") report.claimed.push(`${where} (contract step; the harness judges its effect)`);
      else if (claims.some((c) => claimCovers(c, f))) report.claimed.push(where);
      else
        report.errors.push(
          `${where}\n    Destructive while version a runs. Expand now, contract in a later release (guides/MIGRATIONS.md), or claim it in release/claims.yaml: artefact: migration, scope: "${f.scope}"`
        );
    }
  }
  return report;
}

// ---- git and CLI -----------------------------------------------------------------------------

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function resolveBase(explicit?: string): string | undefined {
  for (const ref of explicit ? [explicit] : ["origin/main", "main"]) {
    try {
      return git(["merge-base", ref, "HEAD"]).trim();
    } catch {
      /* try the next */
    }
  }
  return undefined;
}

function changesSince(base: string): Change[] {
  const changes: Change[] = [];
  const diff = git(["diff", "--name-status", "--no-renames", base, "--", MIGRATIONS_DIR]);
  for (const row of diff.split("\n").filter(Boolean)) {
    const [status, path] = row.split("\t");
    changes.push({ status: status === "A" || status === "D" ? status : "M", file: path.replace(`${MIGRATIONS_DIR}/`, "") });
  }
  for (const path of git(["ls-files", "--others", "--exclude-standard", "--", MIGRATIONS_DIR]).split("\n").filter(Boolean)) {
    changes.push({ status: "A", file: path.replace(`${MIGRATIONS_DIR}/`, "") });
  }
  return changes;
}

function main(): void {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const baseArg = args.includes("--base") ? args[args.indexOf("--base") + 1] : undefined;
  const dir = join(REPO_ROOT, MIGRATIONS_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];

  const base = all ? undefined : resolveBase(baseArg);
  let existing: string[] = [];
  let changes: Change[];
  if (base) {
    existing = git(["ls-tree", "--name-only", base, `${MIGRATIONS_DIR}/`]).split("\n").filter(Boolean).map((p) => p.replace(`${MIGRATIONS_DIR}/`, ""));
    changes = changesSince(base);
  } else {
    process.stdout.write(`No base to compare with${all ? " (--all)" : ""}: every migration is treated as new.` + "\n");
    changes = files.map((file) => ({ status: "A" as const, file }));
  }

  const claimsFile = join(REPO_ROOT, "release/claims.yaml");
  const claims = existsSync(claimsFile) ? readClaims(readFileSync(claimsFile, "utf8")) : [];
  const added = changes.filter((c) => c.status === "A" && c.file.endsWith(".sql") && files.includes(c.file)).map((c) => ({ file: c.file, sql: readFileSync(join(dir, c.file), "utf8") }));

  const changelogFile = join(REPO_ROOT, "CHANGELOG.md");
  const released = existsSync(changelogFile) ? releasedVersions(readFileSync(changelogFile, "utf8")) : new Set<string>();
  const errors = layoutFindings(files, existing, all || !base ? [] : changes);
  const report = evaluate(added, claims, released);
  errors.push(...report.errors);

  for (const line of report.warnings) process.stdout.write(`WARN: ${line}` + "\n");
  for (const line of report.claimed) process.stdout.write(`CLAIMED: ${line}` + "\n");
  if (errors.length > 0) {
    process.stderr.write(`FAIL: ${MIGRATIONS_DIR} breaks the migration rules the release harness enforces:` + "\n");
    for (const e of errors) process.stderr.write(`  ${e}` + "\n");
    process.exit(1);
  }
  process.stdout.write(`OK: ${added.length} added migration${added.length === 1 ? "" : "s"} checked (${files.length} in ${MIGRATIONS_DIR}${base ? `, base ${base.slice(0, 8)}` : ""}).` + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
