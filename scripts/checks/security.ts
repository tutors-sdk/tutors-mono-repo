import ts from "typescript";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, readText, toPosix, walk } from "./lib/repo.ts";

/**
 * Security contracts (runway tier M): response headers, cookie flags, CSRF
 * protection on mutating routes and a diff-aware dependency audit. Header
 * and cookie regressions are the common failure, not exotic exploits.
 */

/* ---------------- response headers ---------------- */

export interface HeaderRule {
  /** Exact value, compared case-insensitively. */
  equals?: string;
  /** Regular expression the value must match. */
  matches?: string;
  reason: string;
}

export interface HeaderContract {
  headers: Record<string, HeaderRule>;
  /** Paths the smoke test requests per app; every response must satisfy the contract. */
  apps: Record<string, { paths: string[] }>;
}

export function loadHeaderContract(root: string = REPO_ROOT): HeaderContract {
  return JSON.parse(readText(join(root, "tests/security/header-contract.json")));
}

/**
 * Findings for one response. Keys omit the path so one gap is one baseline
 * line however many paths show it: `missing-header: app: Name` or
 * `wrong-header: app: Name`.
 */
export function headerFindings(app: string, headers: { get(name: string): string | null }, contract: HeaderContract): string[] {
  const findings: string[] = [];
  for (const [name, rule] of Object.entries(contract.headers)) {
    const value = headers.get(name);
    if (value === null || value.trim() === "") {
      findings.push(`missing-header: ${app}: ${name}`);
    } else if (rule.equals !== undefined && value.trim().toLowerCase() !== rule.equals.toLowerCase()) {
      findings.push(`wrong-header: ${app}: ${name}`);
    } else if (rule.matches !== undefined && !new RegExp(rule.matches, "i").test(value)) {
      findings.push(`wrong-header: ${app}: ${name}`);
    }
  }
  return findings;
}

/* ---------------- cookies ---------------- */

export interface ParsedCookie {
  name: string;
  attributes: Map<string, string>;
}

export function parseSetCookie(header: string): ParsedCookie {
  const [pair, ...parts] = header.split(";");
  const attributes = new Map<string, string>();
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key) attributes.set(key.toLowerCase(), rest.join("=").trim());
  }
  return { name: pair.split("=")[0].trim(), attributes };
}

/**
 * Every cookie a server sets is HttpOnly and declares SameSite; over HTTPS
 * it is also Secure, and SameSite=None is only acceptable with Secure.
 * Cookies deleted with an expiry in the past are ignored.
 */
export function cookieFindings(app: string, setCookies: string[], { https }: { https: boolean }): string[] {
  const findings: string[] = [];
  for (const header of setCookies) {
    const cookie = parseSetCookie(header);
    const expires = cookie.attributes.get("expires");
    const maxAge = cookie.attributes.get("max-age");
    if (maxAge === "0" || (expires && Date.parse(expires) < Date.now())) continue;
    const where = `${app}: ${cookie.name}`;
    if (!cookie.attributes.has("httponly")) findings.push(`cookie-not-httponly: ${where}`);
    const sameSite = cookie.attributes.get("samesite")?.toLowerCase();
    if (!sameSite) findings.push(`cookie-without-samesite: ${where}`);
    const secure = cookie.attributes.has("secure");
    if (https && !secure) findings.push(`cookie-not-secure: ${where}`);
    if (sameSite === "none" && !secure) findings.push(`cookie-samesite-none-without-secure: ${where}`);
  }
  return [...new Set(findings)].sort();
}

/* ---------------- CSRF ---------------- */

/** SvelteKit rejects cross-site form posts unless a config switches that off. */
export function csrfConfigFindings(file: string, text: string): string[] {
  const findings: string[] = [];
  if (/checkOrigin\s*:\s*false/.test(text)) findings.push(`csrf-check-disabled: ${file}`);
  if (/trustedOrigins\s*:\s*\[[^\]]*["']\*["']/.test(text)) findings.push(`csrf-trusts-any-origin: ${file}`);
  return findings;
}

export interface MutatingRoute {
  app: string;
  method: string;
  route: string;
  file: string;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** `apps/time/src/routes/(group)/api/[id]/+server.ts` -> `/api/[id]`. */
export function routeIdFromFile(relativeToRoutes: string): string {
  const segments = relativeToRoutes.split("/").slice(0, -1).filter((segment) => !/^\(.+\)$/.test(segment));
  return `/${segments.join("/")}`;
}

function exportedNames(source: ts.SourceFile): string[] {
  const names: string[] = [];
  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) names.push(statement.name.text);
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) names.push(element.name.text);
    }
  }
  return names;
}

function actionNames(source: ts.SourceFile): string[] {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "actions") continue;
      let init = declaration.initializer;
      while (init && (ts.isSatisfiesExpression(init) || ts.isAsExpression(init))) init = init.expression;
      if (init && ts.isObjectLiteralExpression(init)) {
        return init.properties.map((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : "?"));
      }
      return ["?"];
    }
  }
  return [];
}

/** Mutating endpoints and form actions declared in one route file. */
export function mutatingRoutesIn(app: string, fileRelativeToRoutes: string, text: string): MutatingRoute[] {
  const source = ts.createSourceFile(fileRelativeToRoutes, text, ts.ScriptTarget.Latest, true);
  const route = routeIdFromFile(fileRelativeToRoutes);
  const file = `apps/${app}/src/routes/${fileRelativeToRoutes}`;
  if (fileRelativeToRoutes.endsWith("+server.ts") || fileRelativeToRoutes.endsWith("+server.js")) {
    return exportedNames(source)
      .filter((name) => MUTATING.has(name))
      .map((method) => ({ app, method, route, file }));
  }
  if (/\+page\.server\.[jt]s$/.test(fileRelativeToRoutes)) {
    return actionNames(source).map((name) => ({
      app,
      method: "POST",
      route: name === "default" ? route : `${route}?/${name}`,
      file
    }));
  }
  return [];
}

export function discoverMutatingRoutes(root: string = REPO_ROOT): MutatingRoute[] {
  const appsDir = join(root, "apps");
  return readdirSync(appsDir)
    .filter((app) => existsSync(join(appsDir, app, "src/routes")))
    .flatMap((app) => {
      const routesDir = join(appsDir, app, "src/routes");
      return walk(routesDir, (name) => /^\+(server|page\.server)\.[jt]s$/.test(name)).flatMap((path) =>
        mutatingRoutesIn(app, toPosix(path, routesDir), readText(path))
      );
    })
    .sort((a, b) => routeKey(a).localeCompare(routeKey(b)));
}

export function routeKey(route: Pick<MutatingRoute, "app" | "method" | "route">): string {
  return `${route.app} ${route.method} ${route.route}`;
}

export interface InventoryEntry {
  key: string;
  who: string;
  /** Mounted by a hook (e.g. Auth.js) rather than a route file, so discovery cannot see it. */
  hook: boolean;
}

/**
 * The mutating-route inventory, one route per line:
 *   `time POST /api/sync | who: ...`
 *   `reader POST /auth/* | hook | who: ...`
 */
export function parseInventory(text: string): InventoryEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const [key, ...rest] = line.split("|").map((part) => part.trim());
      const who = rest.find((part) => part.startsWith("who:"))?.slice(4).trim() ?? "";
      return { key, who, hook: rest.includes("hook") };
    });
}

/** New routes must be added with who may call them; removed routes must be deleted. */
export function inventoryFindings(discovered: MutatingRoute[], inventory: InventoryEntry[]): string[] {
  const listed = new Map(inventory.map((entry) => [entry.key, entry]));
  const found = new Set(discovered.map(routeKey));
  const findings: string[] = [];
  for (const key of found) if (!listed.has(key)) findings.push(`unlisted-mutating-route: ${key}`);
  for (const entry of inventory) {
    if (!entry.hook && !found.has(entry.key)) findings.push(`stale-inventory-entry: ${entry.key}`);
    if (entry.who === "") findings.push(`inventory-entry-without-who: ${entry.key}`);
  }
  return findings.sort();
}

/* ---------------- dependency audit ---------------- */

export interface Advisory {
  id: string;
  npmId: number | string;
  module: string;
  severity: string;
  title: string;
  url: string;
}

export interface Allowance {
  id: string;
  package: string;
  reason: string;
  expires: string;
}

/** Advisories from `pnpm audit --json`, keyed by GHSA id where one exists. */
export function parseAudit(json: string): Advisory[] {
  const report = JSON.parse(json) as { advisories?: Record<string, Record<string, unknown>> };
  return Object.values(report.advisories ?? {})
    .map((a) => ({
      id: String(a["github_advisory_id"] ?? a.id),
      npmId: a.id as number,
      module: String(a.module_name),
      severity: String(a.severity),
      title: String(a.title),
      url: String(a.url ?? "")
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export interface AuditOptions {
  today: Date;
  /** PR mode: only advisories absent from the base branch's lockfile can fail. */
  baseline?: Advisory[];
}

export interface AuditResult {
  failures: string[];
  warnings: string[];
}

/**
 * Nightly (no baseline): every advisory must be allowed, and no allowance may
 * be expired. PR mode (baseline given): only advisories this change introduces
 * fail; expired allowances are warnings so an unrelated PR is not blocked.
 */
export function auditFindings(current: Advisory[], allowances: Allowance[], options: AuditOptions): AuditResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const allowed = new Map(allowances.map((entry) => [entry.id, entry]));
  const inBase = new Set((options.baseline ?? []).map((a) => a.id));

  for (const advisory of current) {
    if (allowed.has(advisory.id)) continue;
    const line = `advisory: ${advisory.id} ${advisory.module} (${advisory.severity}): ${advisory.title}`;
    if (options.baseline && inBase.has(advisory.id)) warnings.push(`${line} [already on the base branch]`);
    else failures.push(line);
  }
  for (const entry of allowances) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires) || entry.reason.trim() === "") {
      failures.push(`malformed-allowance: ${entry.id} needs a reason and an expires date (YYYY-MM-DD)`);
      continue;
    }
    if (new Date(`${entry.expires}T23:59:59Z`) < options.today) {
      const line = `expired-allowance: ${entry.id} (${entry.package}) expired ${entry.expires}`;
      if (options.baseline) warnings.push(line);
      else failures.push(line);
    }
    if (!current.some((a) => a.id === entry.id)) {
      warnings.push(`stale-allowance: ${entry.id} (${entry.package}) is no longer reported; delete it`);
    }
  }
  return { failures: failures.sort(), warnings: warnings.sort() };
}
