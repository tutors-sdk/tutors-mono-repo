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
  "NODE_ENV", // set in the Dockerfile runtime stage
  "GIT_SHA", // set in the Dockerfile runtime stage from the build arg; answered by GET /version
  "BUILD_DATE", // set in the Dockerfile runtime stage from the build arg; answered by GET /version
  // Set only by the release harness to freeze the server clock. Deliberately NOT in
  // deploy/k8s: a manifest must never carry it (repoFrozenClockFindings enforces that).
  "HARNESS_NOW"
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

/**
 * `HARNESS_NOW` freezes the server clock for the release harness. The image
 * always runs with NODE_ENV=production, so the variable's absence is the only
 * guard: no deployment manifest or compose file in this repo may mention it.
 */
export function frozenClockFindings(files: { file: string; text: string }[]): string[] {
  return files.filter(({ text }) => /\bHARNESS_NOW\b/.test(text)).map(({ file }) => `frozen-clock-in-deployment: ${file}: HARNESS_NOW`);
}

export function repoFrozenClockFindings(root: string = REPO_ROOT): string[] {
  const files = [
    ...walk(join(root, "deploy"), (name) => /\.(ya?ml|json|env)(\.example)?$/.test(name)),
    ...["compose.yaml", "observability/compose.yaml"].map((name) => join(root, name)).filter((path) => existsSync(path))
  ];
  return frozenClockFindings(files.map((path) => ({ file: toPosix(path, root), text: readText(path) })));
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
  /** When set, every image must be pinned by digest, not by tag alone (how the deploy overlays render). */
  requireDigest?: boolean;
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
 * Why a repository path cannot be pulled reliably, if it cannot. CRI-O (and so
 * OpenShift) refuses or guesses at short names, so the registry host must be
 * spelled out; and Quay repositories are exactly `quay.io/<org>/<repo>`, with
 * no nested path segments.
 */
export function imageRepositoryFinding(repository: string): string | undefined {
  const segments = repository.split("/");
  const host = segments[0];
  const qualified = segments.length > 1 && (host.includes(".") || host.includes(":") || host === "localhost");
  if (!qualified) return "unqualified-image";
  if (host === "quay.io" && segments.length !== 3) return "quay-nested-repository";
  return undefined;
}

/**
 * Policies a workload must satisfy to run under OpenShift's `restricted-v2`
 * SCC and to be operable: registry-qualified, pinned images, requests and limits, probes, and a
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
      const repositoryFinding = imageRepositoryFinding(image.repository);
      if (repositoryFinding) findings.push(`${repositoryFinding}: ${where}: ${container.image}`);
      if (!image.digest && (!image.tag || image.tag === "latest")) {
        findings.push(`unpinned-image: ${where}: ${container.image}`);
      } else if (options.expectedTag && !image.digest && image.tag !== options.expectedTag) {
        findings.push(`image-tag-not-release: ${where}: ${container.image} (expected tag ${options.expectedTag})`);
      }
      if (options.requireDigest && !image.digest) findings.push(`image-not-digest-pinned: ${where}: ${container.image}`);

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

/* ---------------- entry point policy ---------------- */

const asList = (value: unknown): Obj[] => (Array.isArray(value) ? (value as Obj[]) : []);

/**
 * Policies for the external entry point (OpenShift Route or Ingress) of one
 * rendered kustomization. adapter-node builds absolute URLs and checks form
 * posts against `ORIGIN`, so the exposed host must be the `ORIGIN` host; the
 * backend must be a Service port that is actually rendered (a component applied
 * inside an overlay misses the name prefix); a Route must terminate TLS and
 * redirect plain HTTP. Findings are `rule: Kind/name: detail`.
 */
export function entryPointPolicyFindings(docs: Obj[]): string[] {
  const findings: string[] = [];
  const objects = docs.filter((doc) => doc && typeof doc === "object");
  const origins = objects
    .filter((doc) => doc.kind === "ConfigMap")
    .map((doc) => (doc.data as Obj | undefined)?.ORIGIN)
    .filter((origin): origin is string => typeof origin === "string" && origin !== "");
  const originHosts = new Set(origins.map((origin) => (URL.canParse(origin) ? new URL(origin).hostname : origin)));
  const servicePorts = new Map<string, Set<string>>();
  for (const doc of objects.filter((doc) => doc.kind === "Service")) {
    const ports = asList((doc.spec as Obj | undefined)?.ports).flatMap((port) => [port.name, port.port, port.targetPort]);
    servicePorts.set(String((doc.metadata as Obj | undefined)?.name), new Set(ports.filter((p) => p !== undefined).map(String)));
  }

  const checkHost = (name: string, host: unknown) => {
    if (typeof host !== "string" || host === "") findings.push(`entry-point-without-host: ${name}`);
    else if (!originHosts.has(host)) findings.push(`host-not-origin: ${name}: ${host} (ORIGIN is ${origins.join(", ") || "not set"})`);
  };
  const checkBackend = (name: string, service: unknown, port: unknown) => {
    const ports = servicePorts.get(String(service));
    if (!ports) findings.push(`backend-service-not-rendered: ${name}: ${service}`);
    else if (port === undefined || !ports.has(String(port))) findings.push(`backend-port-not-on-service: ${name}: ${service}:${port}`);
  };

  for (const doc of objects) {
    const name = `${doc.kind}/${(doc.metadata as Obj | undefined)?.name ?? "?"}`;
    const spec = (doc.spec as Obj | undefined) ?? {};
    if (doc.kind === "Route" && String(doc.apiVersion).startsWith("route.openshift.io/")) {
      checkHost(name, spec.host);
      const to = (spec.to as Obj | undefined) ?? {};
      if (to.kind !== "Service") findings.push(`backend-service-not-rendered: ${name}: ${to.kind}/${to.name}`);
      else checkBackend(name, to.name, (spec.port as Obj | undefined)?.targetPort);
      const tls = spec.tls as Obj | undefined;
      if (!tls?.termination) findings.push(`route-without-tls: ${name}`);
      // Passthrough routes carry no plain-HTTP listener to redirect.
      else if (tls.termination !== "passthrough" && tls.insecureEdgeTerminationPolicy !== "Redirect") {
        findings.push(`route-insecure-not-redirected: ${name}: ${tls.insecureEdgeTerminationPolicy ?? "unset"}`);
      }
    }
    if (doc.kind === "Ingress" && String(doc.apiVersion).startsWith("networking.k8s.io/")) {
      if (!spec.ingressClassName) findings.push(`ingress-without-class: ${name}`);
      const rules = asList(spec.rules);
      if (rules.length === 0) findings.push(`entry-point-without-host: ${name}`);
      if (spec.defaultBackend) findings.push(`ingress-default-backend: ${name}: answers for every host, not only ORIGIN`);
      for (const rule of rules) {
        checkHost(name, rule.host);
        for (const path of asList((rule.http as Obj | undefined)?.paths)) {
          const service = ((path.backend as Obj | undefined)?.service as Obj | undefined) ?? {};
          const port = (service.port as Obj | undefined) ?? {};
          checkBackend(name, service.name, port.name ?? port.number);
        }
      }
      const ruleHosts = new Set(rules.map((rule) => rule.host));
      for (const tls of asList(spec.tls)) {
        const hosts = (tls.hosts as string[] | undefined) ?? [];
        if (!tls.secretName) findings.push(`ingress-tls-without-secret: ${name}`);
        for (const host of ruleHosts) if (!hosts.includes(host as string)) findings.push(`ingress-tls-host-mismatch: ${name}: ${host} not in tls hosts`);
      }
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

/**
 * Substrate variants: an overlay plus its entry point component, laid out as
 * `deploy/k8s/variants/<substrate>/<app>`.
 */
export function variantDirs(root: string = REPO_ROOT): string[] {
  const variants = join(root, "deploy/k8s/variants");
  if (!existsSync(variants)) return [];
  return readdirSync(variants, { withFileTypes: true })
    .filter((substrate) => substrate.isDirectory())
    .flatMap((substrate) => readdirSync(join(variants, substrate.name)).map((app) => join(variants, substrate.name, app)))
    .filter((dir) => existsSync(join(dir, "kustomization.yaml")))
    .sort();
}
