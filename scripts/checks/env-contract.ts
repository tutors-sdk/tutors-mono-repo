/**
 * The environment contract (packages/svelte/app-config/src/env-contract.js) against everywhere a
 * deployment's variables are written down. Release 17.1.0 went out with two variables the reader
 * needed and production lacked: they were in the code and in .env.example, nothing failed, and the
 * reader answered 503 on /api. This check fails before that happens.
 *
 *   pnpm check:env                 # the repository: code, .env.example files, Kubernetes overlays (CI)
 *   pnpm check:env --app reader    # this process's environment against what the reader needs
 *
 * The repository check (Rules 0687-0689) fails when:
 *   - code reads a variable through $app/env that the contract does not declare, or that the contract
 *     does not list for the app reading it; or the contract declares a variable no code reads;
 *   - a contract variable has no line in .env.example or deploy/staging/.env.example;
 *   - a variable an app needs (required, or signed-in) is in neither that app's ConfigMap (base plus its
 *     overlay's patches) nor a secrets.yaml.example the app's Secret is made from.
 *
 * The --app check (Rule 0686) runs first in each app's Netlify build command. On a Netlify production
 * build (CONTEXT=production) a missing variable fails the build, so Netlify keeps serving the previous
 * deploy; on deploy previews and branch deploys it warns. Outside Netlify it fails. It prints names, never values.
 * For the reader it then checks the service-role key's value (Rule 0691): Supabase must accept it as service_role.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { APPS, ENV_CONTRACT, isAnonymous, missingVariables, requiredVariables } from "../../packages/svelte/app-config/src/env-contract.js";
import { checkServiceKey } from "../../packages/svelte/app-config/src/service-key.js";
import { overlayDirs } from "./conformance.ts";
import { REPO_ROOT, readText, toPosix, walk } from "./lib/repo.ts";

type App = (typeof APPS)[number];
type Contract = typeof ENV_CONTRACT;

const SOURCE = /\.(ts|js|svelte)$/;
const IMPORT = /import\s+(?:\*\s+as\s+(\w+)|\{([^}]*)\})\s+from\s+["']\$app\/env\/(private|public)["']/g;

/** One variable read through $app/env: the file, which app (if the file is in an app), and private or public. */
export interface EnvRead {
  file: string;
  app?: App;
  name: string;
  scope: "private" | "public";
}

/** The $app/env/private and $app/env/public reads in one source file. */
export function readsIn(file: string, text: string, app?: App): EnvRead[] {
  const reads: EnvRead[] = [];
  for (const match of text.matchAll(IMPORT)) {
    const [, namespace, named, scope] = match as unknown as [string, string | undefined, string | undefined, "private" | "public"];
    if (namespace) {
      for (const use of text.matchAll(new RegExp(`\\b${namespace}\\.([A-Z][A-Z0-9_]*)\\b`, "g"))) reads.push({ file, app, name: use[1]!, scope });
    } else {
      for (const part of named!.split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0]!.trim();
        if (/^[A-Z][A-Z0-9_]*$/.test(name)) reads.push({ file, app, name, scope });
      }
    }
  }
  return reads;
}

/** Every $app/env read in the apps and the Svelte packages. */
export function codeReads(root: string = REPO_ROOT): EnvRead[] {
  const reads: EnvRead[] = [];
  for (const app of APPS) {
    for (const file of walk(join(root, "apps", app, "src"), (n) => SOURCE.test(n))) reads.push(...readsIn(toPosix(file, root), readFileSync(file, "utf8"), app));
  }
  for (const file of walk(join(root, "packages/svelte"), (n) => SOURCE.test(n))) {
    if (file.includes("/tests/") || /\.test\.ts$/.test(file)) continue;
    reads.push(...readsIn(toPosix(file, root), readFileSync(file, "utf8")));
  }
  return reads;
}

/** Rule 0687: code and contract agree on which variables exist, which app reads each, and which are public. */
export function codeFindings(reads: EnvRead[], contract: Contract = ENV_CONTRACT): string[] {
  const findings: string[] = [];
  for (const read of reads) {
    const declared = contract[read.name];
    if (!declared) {
      findings.push(`${read.file} reads ${read.name}, which the environment contract does not declare: add it to packages/svelte/app-config/src/env-contract.js`);
    } else if (read.scope === "public" && !declared.public) {
      findings.push(`${read.file} reads ${read.name} from $app/env/public, but the contract declares it private`);
    } else if (read.app && !declared.apps[read.app]) {
      findings.push(`${read.file} reads ${read.name} in the ${read.app} app, but the contract does not list ${read.app} for it`);
    }
  }
  const read = new Set(reads.map((r) => r.name));
  for (const name of Object.keys(contract)) {
    if (!read.has(name)) findings.push(`the environment contract declares ${name}, which no code reads: remove it`);
  }
  return [...new Set(findings)];
}

/** The variable names an env file assigns (`NAME=`, commented-out lines excluded). */
export function envFileNames(text: string): Set<string> {
  return new Set([...text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]!));
}

/** Rule 0688: every contract variable is written down where a person sets up an environment. */
export function envFileFindings(files: Record<string, string>, contract: Contract = ENV_CONTRACT): string[] {
  const findings: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    const names = envFileNames(text);
    for (const name of Object.keys(contract)) if (!names.has(name)) findings.push(`${path} has no ${name}= line`);
  }
  return findings;
}

/** The keys under `stringData`/`data` of every Secret in a secrets.yaml.example. */
function secretKeys(text: string): string[] {
  return yaml.loadAll(text).flatMap((doc) => {
    const secret = doc as { kind?: string; stringData?: Record<string, unknown>; data?: Record<string, unknown> } | null;
    return secret?.kind === "Secret" ? [...Object.keys(secret.stringData ?? {}), ...Object.keys(secret.data ?? {})] : [];
  });
}

/** The ConfigMap keys an overlay adds or replaces with JSON-patch ops on /data/<KEY>. */
function patchedKeys(kustomization: string): string[] {
  const doc = yaml.load(kustomization) as { patches?: { patch?: string }[] } | null;
  return (doc?.patches ?? []).flatMap((p) => {
    const ops = p.patch ? (yaml.load(p.patch) as { op?: string; path?: string }[] | null) : null;
    return Array.isArray(ops) ? ops.filter((o) => (o.op === "add" || o.op === "replace") && o.path?.startsWith("/data/")).map((o) => o.path!.slice("/data/".length)) : [];
  });
}

/** Each app's Kubernetes overlay: the variable names its ConfigMap and its Secret examples provide. */
export function overlayVariables(root: string = REPO_ROOT): Partial<Record<App, Set<string>>> {
  const base = yaml.load(readText(join(root, "deploy/k8s/base/configmap.yaml"))) as { data?: Record<string, unknown> };
  const baseSecret = join(root, "deploy/k8s/base/secrets.yaml.example");
  const shared = [...Object.keys(base.data ?? {}), ...(existsSync(baseSecret) ? secretKeys(readText(baseSecret)) : [])];
  const out: Partial<Record<App, Set<string>>> = {};
  for (const dir of overlayDirs(root)) {
    const app = basename(dir) as App;
    if (!APPS.includes(app)) continue;
    const secrets = join(dir, "secrets.yaml.example");
    out[app] = new Set([...shared, ...patchedKeys(readText(join(dir, "kustomization.yaml"))), ...(existsSync(secrets) ? secretKeys(readText(secrets)) : [])]);
  }
  return out;
}

/** Rule 0689: every variable an app needs signed in has a place in that app's overlay. */
export function overlayFindings(overlays: Partial<Record<App, Set<string>>>, contract: Contract = ENV_CONTRACT): string[] {
  const findings: string[] = [];
  for (const app of APPS) {
    const provided = overlays[app];
    if (!provided) continue;
    for (const [name, v] of Object.entries(contract)) {
      const level = v.apps[app];
      if (level !== "required" && level !== "signed-in") continue;
      if (!provided.has(name)) {
        const where = v.secret ? `deploy/k8s/overlays/${app}/secrets.yaml.example` : `a /data/${name} patch in deploy/k8s/overlays/${app}/kustomization.yaml`;
        findings.push(`the ${app} overlay does not provide ${name} (${level}): add it to ${where}`);
      }
    }
  }
  return findings;
}

/** The whole repository check. */
export function repositoryFindings(root: string = REPO_ROOT): string[] {
  const envFiles = Object.fromEntries([".env.example", "deploy/staging/.env.example"].map((p) => [p, readText(join(root, p))]));
  return [...codeFindings(codeReads(root)), ...envFileFindings(envFiles), ...overlayFindings(overlayVariables(root))];
}

/** Rule 0686: what the --app check does with this environment. Names only. */
export function processVerdict(app: App, values: Record<string, string | undefined>): { outcome: "pass" | "warn" | "fail"; lines: string[] } {
  const missing = missingVariables(app, values);
  const mode = isAnonymous(values) ? "anonymous mode" : "sign-in on";
  if (missing.length === 0) {
    const needed = requiredVariables(app, values).length;
    return { outcome: "pass", lines: [needed === 0 ? `check:env: tutors-${app} needs no variables (${mode}).` : `check:env: tutors-${app} has the ${needed} variables it needs (${mode}).`] };
  }
  const onNetlify = values.NETLIFY === "true";
  const production = !onNetlify || values.CONTEXT === "production";
  const lines = [
    `check:env: tutors-${app} needs ${missing.length} variable${missing.length === 1 ? "" : "s"} this environment lacks (${mode}):`,
    ...missing.map((name) => `  - ${name}`),
    onNetlify
      ? `Set ${missing.length === 1 ? "it" : "them"} under Site configuration > Environment variables for this site, with the Builds and Functions scopes.`
      : "Set them in this environment (see .env.example)."
  ];
  if (!production) lines.push(`Not a production build (CONTEXT=${values.CONTEXT ?? "unset"}), so this is a warning.`);
  return { outcome: production ? "fail" : "warn", lines };
}

type Verdict = { outcome: "pass" | "warn" | "fail"; lines: string[] };

/**
 * Rule 0691: the reader's service-role key, checked by value before the build: a key that is not a
 * service-role key, or one Supabase refuses, fails a production build; Supabase being unreachable only warns.
 * Undefined when there is nothing to check (another app, anonymous mode, or no key: processVerdict reports that).
 */
export async function serviceKeyVerdict(app: App, values: Record<string, string | undefined>, fetchImpl?: typeof fetch): Promise<Verdict | undefined> {
  if (app !== "reader" || isAnonymous(values)) return undefined;
  const result = await checkServiceKey({ url: values.PUBLIC_SUPABASE_URL, key: values.PRIVATE_SUPABASE_SERVICE_ROLE_KEY, fetch: fetchImpl, timeoutMs: 10_000 });
  if (result.status === "missing") return undefined;
  if (result.status === "ok") return { outcome: "pass", lines: ["check:env: Supabase accepts PRIVATE_SUPABASE_SERVICE_ROLE_KEY as the service role."] };
  const production = values.NETLIFY !== "true" || values.CONTEXT === "production";
  if (result.status === "unreachable") {
    return { outcome: "warn", lines: [`check:env: could not ask Supabase about PRIVATE_SUPABASE_SERVICE_ROLE_KEY (${result.message}); building anyway.`] };
  }
  const lines = [`check:env: ${result.message}.`, "Copy the service_role (secret) key from the Supabase project's API settings into this site's PRIVATE_SUPABASE_SERVICE_ROLE_KEY."];
  if (!production) lines.push(`Not a production build (CONTEXT=${values.CONTEXT ?? "unset"}), so this is a warning.`);
  return { outcome: production ? "fail" : "warn", lines };
}

/* eslint-disable no-console -- a command-line check: its findings are its output. */
async function main(argv: string[]): Promise<number> {
  const appIndex = argv.indexOf("--app");
  if (appIndex >= 0) {
    const app = argv[appIndex + 1] as App;
    if (!APPS.includes(app)) {
      console.error(`check:env: --app takes one of ${APPS.join(", ")}`);
      return 2;
    }
    const verdicts = [processVerdict(app, process.env)];
    if (verdicts[0]!.outcome === "pass") {
      const key = await serviceKeyVerdict(app, process.env);
      if (key) verdicts.push(key);
    }
    for (const verdict of verdicts) (verdict.outcome === "pass" ? console.log : console.error)(verdict.lines.join("\n"));
    return verdicts.some((v) => v.outcome === "fail") ? 1 : 0;
  }
  const findings = repositoryFindings();
  if (findings.length === 0) {
    console.log(`check:env: ${Object.keys(ENV_CONTRACT).length} variables agree across code, .env.example files and ${APPS.length} overlays.`);
    return 0;
  }
  console.error(`check:env: ${findings.length} finding${findings.length === 1 ? "" : "s"}:\n${findings.map((f) => `  - ${f}`).join("\n")}`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main(process.argv.slice(2)).then((code) => (process.exitCode = code));
