import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, readText } from "./lib/repo.ts";

/**
 * JSR packages ship twice: to JSR from deno.json and into the Node workspace
 * from package.json. The two manifests drift silently, so the published
 * package and the one the apps test against end up different.
 */

interface DenoManifest {
  name?: string;
  version?: string;
  exports?: string | Record<string, string>;
  imports?: Record<string, string>;
  workspace?: string[];
}

interface NodeManifest {
  name?: string;
  version?: string;
  exports?: string | Record<string, string>;
  dependencies?: Record<string, string>;
}

function normaliseExports(exports: DenoManifest["exports"]): Record<string, string> {
  if (exports === undefined) return {};
  return typeof exports === "string" ? { ".": exports } : exports;
}

/** Major version of a range such as `^4.1.1`, `~2.0.0`, `4` or `>=3 <4`; undefined when unreadable. */
export function majorOf(range: string): number | undefined {
  const match = range.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

/** `npm:js-yaml@^4.1.1` -> { name: "js-yaml", range: "^4.1.1" }; scoped names keep their `@`. */
export function parseSpecifier(specifier: string): { registry: string; name: string; range: string } | undefined {
  const match = specifier.match(/^(npm|jsr):(@?[^@]+)@(.+)$/);
  return match ? { registry: match[1], name: match[2], range: match[3] } : undefined;
}

/** `^5.2.3` accepts 5.2.3 and 5.9.0 but not 6.0.0 or 5.2.2. Only caret and exact ranges are understood. */
export function satisfiesCaret(version: string, range: string): boolean {
  const parse = (v: string) => v.replace(/^[\^~=]/, "").split(".").map(Number);
  const [maj, min, pat] = parse(version);
  const [rMaj, rMin = 0, rPat = 0] = parse(range);
  if (!range.startsWith("^")) return maj === rMaj && min === rMin && pat === rPat;
  if (maj !== rMaj) return false;
  if (min !== rMin) return min > rMin;
  return pat >= rPat;
}

/** Findings comparing one package's deno.json with its package.json. Each finding is `<dir>: <problem>`. */
export function compareManifests(dir: string, deno: DenoManifest, node: NodeManifest): string[] {
  const findings: string[] = [];
  if (deno.name !== node.name) findings.push(`${dir}: name differs (deno.json ${deno.name}, package.json ${node.name})`);
  if (deno.version !== node.version) {
    findings.push(`${dir}: version differs (deno.json ${deno.version}, package.json ${node.version})`);
  }

  const denoExports = normaliseExports(deno.exports);
  const nodeExports = normaliseExports(node.exports);
  for (const key of new Set([...Object.keys(denoExports), ...Object.keys(nodeExports)])) {
    if (denoExports[key] !== nodeExports[key]) {
      findings.push(`${dir}: export "${key}" differs (deno.json ${denoExports[key]}, package.json ${nodeExports[key]})`);
    }
  }

  const denoNpm = new Map<string, string>();
  for (const specifier of Object.values(deno.imports ?? {})) {
    const parsed = parseSpecifier(specifier);
    if (parsed?.registry === "npm") denoNpm.set(parsed.name, parsed.range);
  }
  for (const [name, range] of Object.entries(node.dependencies ?? {})) {
    if (range.startsWith("workspace:")) continue;
    const denoRange = denoNpm.get(name);
    if (denoRange === undefined) {
      findings.push(`${dir}: dependency ${name} is in package.json but not in deno.json imports`);
    } else if (majorOf(denoRange) !== majorOf(range)) {
      findings.push(`${dir}: dependency ${name} major differs (deno.json ${denoRange}, package.json ${range})`);
    }
  }
  for (const name of denoNpm.keys()) {
    // Type-only packages are a Deno concern; Node gets them from devDependencies.
    if (name.startsWith("@types/")) continue;
    if (!(name in (node.dependencies ?? {}))) {
      findings.push(`${dir}: dependency ${name} is in deno.json imports but not in package.json`);
    }
  }
  return findings;
}

/**
 * Check every JSR package: listed in the root deno.json workspace, manifests
 * agree where both exist, and `jsr:@tutors/*` imports accept the version the
 * workspace actually has.
 */
export function checkJsrWorkspace(root: string = REPO_ROOT): string[] {
  const findings: string[] = [];
  const jsrDir = join(root, "packages/jsr");
  const dirs = readdirSync(jsrDir).filter((name) => existsSync(join(jsrDir, name, "deno.json")));
  const rootDeno: DenoManifest = JSON.parse(readText(join(root, "deno.json")));
  const listed = new Set((rootDeno.workspace ?? []).map((entry) => entry.replace(/^\.\//, "").replace(/\/$/, "")));

  const versions = new Map<string, string>();
  const manifests = new Map<string, DenoManifest>();
  for (const name of dirs) {
    const dir = `packages/jsr/${name}`;
    const deno: DenoManifest = JSON.parse(readText(join(root, dir, "deno.json")));
    manifests.set(dir, deno);
    if (deno.name && deno.version) versions.set(deno.name, deno.version);
    if (!listed.has(dir)) findings.push(`${dir}: missing from the root deno.json workspace`);
    const nodePath = join(root, dir, "package.json");
    if (existsSync(nodePath)) findings.push(...compareManifests(dir, deno, JSON.parse(readText(nodePath))));
  }

  for (const [dir, deno] of manifests) {
    for (const specifier of Object.values(deno.imports ?? {})) {
      const parsed = parseSpecifier(specifier);
      if (parsed?.registry !== "jsr" || !versions.has(parsed.name)) continue;
      const actual = versions.get(parsed.name)!;
      if (!satisfiesCaret(actual, parsed.range)) {
        findings.push(`${dir}: imports ${parsed.name}@${parsed.range} but the workspace has ${actual}`);
      }
    }
  }
  return findings.sort();
}
