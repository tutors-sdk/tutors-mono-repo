import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { REPO_ROOT, readText, toPosix, walk } from "./lib/repo.ts";

/**
 * Container and platform conformance (runway tier J): configuration the code
 * reads is documented where operators set it, and the Kubernetes manifests
 * would be admitted by OpenShift's restricted security context constraints.
 */

/* ---------------- configuration completeness ---------------- */

/** Variables the platform or toolchain provides; nobody configures them. */
export const PLATFORM_ENV: ReadonlySet<string> = new Set([
  "DEV", // Vite build flag
  "SSR", // Vite build flag
  "PROD", // Vite build flag
  "MODE", // Vite build flag
  "BASE_URL", // Vite build flag
  "HOSTNAME", // set by Kubernetes to the pod name
  "NODE_ENV" // set in the Dockerfile runtime stage
]);

const ENV_READ_PATTERNS = [
  // env.X, env?.X, process.env.X, import.meta.env.X, serverEnv()).X
  /(?:\benv|Env\(\)\)*|\bprocess\.env|\bimport\.meta\.env)\??\.([A-Z][A-Z0-9_]+)\b/g,
  // env["X"]
  /\benv\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/g
];

/** Environment variables a source file reads, including `$env/static/*` named imports. */
export function envVarsRead(text: string): string[] {
  const names = new Set<string>();
  for (const pattern of ENV_READ_PATTERNS) for (const match of text.matchAll(pattern)) names.add(match[1]);
  for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\$env\/static\/(?:public|private)["']/g)) {
    for (const name of match[1].split(",").map((part) => part.trim().split(/\s+as\s+/)[0])) {
      if (/^[A-Z][A-Z0-9_]+$/.test(name)) names.add(name);
    }
  }
  return [...names];
}

/** Keys in a dotenv file, whether or not they have a value. */
export function dotenvKeys(text: string): Set<string> {
  return new Set([...text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]));
}

/** Keys a set of Kubernetes YAML files would put into a container's environment. */
export function k8sEnvKeys(files: { file: string; text: string }[]): Set<string> {
  const keys = new Set<string>();
  for (const { text } of files) {
    for (const doc of yaml.loadAll(text) as Record<string, unknown>[]) {
      if (!doc || typeof doc !== "object") continue;
      if (doc.kind === "ConfigMap" || doc.kind === "Secret") {
        for (const field of ["data", "stringData"]) {
          Object.keys((doc[field] as object | undefined) ?? {}).forEach((key) => keys.add(key));
        }
      }
    }
    // JSON patches in kustomizations: `path: /data/KEY`
    for (const match of text.matchAll(/path:\s*\/(?:string)?[dD]ata\/([A-Z][A-Z0-9_]+)/g)) keys.add(match[1]);
  }
  return keys;
}

export function configCompletenessFindings(
  sources: { file: string; text: string }[],
  documented: { envExample: Set<string>; k8s: Set<string> }
): string[] {
  const readers = new Map<string, Set<string>>();
  for (const { file, text } of sources) {
    for (const name of envVarsRead(text)) {
      if (PLATFORM_ENV.has(name)) continue;
      if (!readers.has(name)) readers.set(name, new Set());
      readers.get(name)!.add(file);
    }
  }
  const findings: string[] = [];
  for (const [name, files] of [...readers].sort(([a], [b]) => a.localeCompare(b))) {
    const where = [...files].sort()[0];
    if (!documented.envExample.has(name)) findings.push(`undocumented-env: .env.example: ${name} (read in ${where})`);
    if (!documented.k8s.has(name)) findings.push(`undocumented-env: deploy/k8s: ${name} (read in ${where})`);
  }
  return findings;
}

export function repoConfigCompletenessFindings(root: string = REPO_ROOT): string[] {
  const sourceRoots = [
    ...readdirSync(join(root, "apps")).map((app) => join(root, "apps", app, "src")),
    join(root, "packages/svelte")
  ];
  const sources = sourceRoots
    .flatMap((dir) => walk(dir, (name) => /\.(ts|js|svelte)$/.test(name) && !/\.(test|spec)\.ts$/.test(name)))
    .filter((path) => !/[\\/](__tests__|tests)[\\/]/.test(path))
    // Build-time config (the vite.config / svelte.config helpers): read while the
    // image is built, never by a running pod, so outside the runtime env contract.
    .filter((path) => !/[\\/]packages[\\/]svelte[\\/]app-config[\\/]/.test(path))
    .map((path) => ({ file: toPosix(path, root), text: readText(path) }));
  const k8sFiles = walk(join(root, "deploy/k8s"), (name) => /\.ya?ml(\.example)?$/.test(name)).map((path) => ({
    file: toPosix(path, root),
    text: readText(path)
  }));
  return configCompletenessFindings(sources, {
    envExample: dotenvKeys(readText(join(root, ".env.example"))),
    k8s: k8sEnvKeys(k8sFiles)
  });
}

/* ---------------- manifest policy ---------------- */

type Obj = Record<string, unknown>;

const WORKLOAD_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"]);

function podSpecOf(doc: Obj): Obj | undefined {
  const spec = doc.spec as Obj | undefined;
  if (doc.kind === "CronJob") return ((((spec?.jobTemplate as Obj)?.spec as Obj)?.template as Obj)?.spec as Obj) ?? undefined;
  return ((spec?.template as Obj)?.spec as Obj) ?? undefined;
}

export interface PolicyOptions {
  /** When set, every image must carry exactly this tag (the release the manifests describe). */
  expectedTag?: string;
}

/** Split `registry:5000/org/app:1.2.3@sha256:...` into repository, tag and digest. */
export function parseImage(image: string): { repository: string; tag?: string; digest?: string } {
  const [withoutDigest, digest] = image.split("@");
  const slash = withoutDigest.lastIndexOf("/");
  const colon = withoutDigest.lastIndexOf(":");
  if (colon > slash) return { repository: withoutDigest.slice(0, colon), tag: withoutDigest.slice(colon + 1), digest };
  return { repository: withoutDigest, digest };
}

/**
 * Policies a workload must satisfy to run under OpenShift's `restricted-v2`
 * SCC and to be operable: pinned images, requests and limits, probes, and a
 * locked-down security context. Findings are `rule: Kind/name[/container]: detail`.
 */
export function manifestPolicyFindings(docs: Obj[], options: PolicyOptions = {}): string[] {
  const findings: string[] = [];
  for (const doc of docs) {
    if (!doc || !WORKLOAD_KINDS.has(doc.kind as string)) continue;
    const name = `${doc.kind}/${(doc.metadata as Obj | undefined)?.name ?? "?"}`;
    const pod = podSpecOf(doc);
    if (!pod) {
      findings.push(`no-pod-spec: ${name}`);
      continue;
    }
    const podSecurity = (pod.securityContext as Obj | undefined) ?? {};
    for (const flag of ["hostNetwork", "hostPID", "hostIPC"]) {
      if (pod[flag] === true) findings.push(`host-namespace: ${name}: ${flag}`);
    }
    for (const volume of (pod.volumes as Obj[] | undefined) ?? []) {
      if (volume.hostPath) findings.push(`host-path-volume: ${name}: ${volume.name}`);
    }
    if (pod.automountServiceAccountToken !== false) findings.push(`service-account-token-mounted: ${name}`);

    const containers = [...((pod.initContainers as Obj[] | undefined) ?? []), ...((pod.containers as Obj[] | undefined) ?? [])];
    const initNames = new Set(((pod.initContainers as Obj[] | undefined) ?? []).map((c) => c.name));
    for (const container of containers) {
      const where = `${name}/${container.name}`;
      const image = parseImage(String(container.image ?? ""));
      if (!image.digest && (!image.tag || image.tag === "latest")) {
        findings.push(`unpinned-image: ${where}: ${container.image}`);
      } else if (options.expectedTag && !image.digest && image.tag !== options.expectedTag) {
        findings.push(`image-tag-not-release: ${where}: ${container.image} (expected tag ${options.expectedTag})`);
      }

      const resources = (container.resources as Obj | undefined) ?? {};
      const requests = (resources.requests as Obj | undefined) ?? {};
      const limits = (resources.limits as Obj | undefined) ?? {};
      if (!requests.cpu || !requests.memory) findings.push(`missing-requests: ${where}`);
      if (!limits.memory) findings.push(`missing-memory-limit: ${where}`);

      if (!initNames.has(container.name)) {
        if (!container.livenessProbe) findings.push(`missing-liveness-probe: ${where}`);
        if (!container.readinessProbe) findings.push(`missing-readiness-probe: ${where}`);
      }

      const security = (container.securityContext as Obj | undefined) ?? {};
      const effective = (key: string) => (key in security ? security[key] : podSecurity[key]);
      if (security.privileged === true) findings.push(`privileged: ${where}`);
      if (security.allowPrivilegeEscalation !== false) findings.push(`privilege-escalation-allowed: ${where}`);
      if (security.readOnlyRootFilesystem !== true) findings.push(`writable-root-filesystem: ${where}`);
      const drop = (((security.capabilities as Obj | undefined)?.drop as string[] | undefined) ?? []).map((c) => c.toUpperCase());
      if (!drop.includes("ALL")) findings.push(`capabilities-not-dropped: ${where}`);
      if (effective("runAsNonRoot") !== true) findings.push(`may-run-as-root: ${where}`);
      // restricted-v2 assigns a UID from the namespace range; a fixed UID outside it is rejected.
      if (effective("runAsUser") !== undefined) findings.push(`fixed-run-as-user: ${where}: ${effective("runAsUser")}`);
      const seccomp = (effective("seccompProfile") as Obj | undefined)?.type;
      if (seccomp !== "RuntimeDefault" && seccomp !== "Localhost") findings.push(`missing-seccomp-profile: ${where}`);
    }
  }
  return findings.sort();
}

/* ---------------- rendering ---------------- */

/** Render one kustomization with whichever of `kustomize` or `kubectl kustomize` is installed. */
export function renderKustomization(dir: string): string {
  const attempts: [string, string[]][] = [
    ["kustomize", ["build", dir]],
    ["kubectl", ["kustomize", dir]]
  ];
  const errors: string[] = [];
  for (const [command, args] of attempts) {
    try {
      return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      errors.push(`${command}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  throw new Error(`Could not render ${dir}. Install kustomize or kubectl.\n${errors.join("\n")}`);
}

export function overlayDirs(root: string = REPO_ROOT): string[] {
  const overlays = join(root, "deploy/k8s/overlays");
  return readdirSync(overlays)
    .map((name) => join(overlays, name))
    .filter((dir) => existsSync(join(dir, "kustomization.yaml")))
    .sort();
}
