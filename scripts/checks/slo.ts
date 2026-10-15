/**
 * Service level objectives (issue #170; docs/slo.md): release/slo.yaml, and the Grafana burn-rate alerts generated
 * from it.
 *
 *   pnpm check:slo              # release/slo.yaml, and alerts.yml against what it generates (Rules 0295, 0296, 0298)
 *   pnpm check:slo path/to/file # any other SLO file, shape only
 *   pnpm slo:alerts             # rewrite observability/grafana/provisioning/alerting/alerts.yml from it (Rule 0297)
 *
 * The release harness (tutors-sdk/tutors-release-harness, src/slo/schema.ts there, since harness 1.34.0) fetches the
 * file from beside release/claims.yaml, judges each candidate against it, and refuses a file it cannot use before any
 * stack starts. This check mirrors its rules so the release push fails first:
 *
 *   - the file: `window` is days ("28d"), `objectives` lists at least one, `version` is 1 when given;
 *   - each objective has a lower-case `id` (unique, and short enough for the Grafana rule uids built from it), an `app`
 *     of reader, catalogue, live or time, a `kind` of availability or latency, and a `target` share above 0 and
 *     under 1 (1 leaves no error budget);
 *   - a latency objective's `threshold` is a bucket bound of http_request_duration_seconds, which the observability
 *     contract test pins, or its SLI could not be computed exactly; an availability objective has none.
 *
 * The targets are indicative: what the college aims for. The harness keeps its own, stricter floors and judges the
 * stricter of the two, so lowering a number here never loosens a release.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { REPO_ROOT } from "./lib/repo.ts";

export const SLO_FILE = "release/slo.yaml";
export const ALERTS_FILE = "observability/grafana/provisioning/alerting/alerts.yml";
export const SLO_APPS = ["reader", "catalogue", "live", "time"] as const;
/** The bounds of http_request_duration_seconds (tests/observability/observability-contracts.test.ts pins them). */
export const LATENCY_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;
const SLO_ID = /^[a-z][a-z0-9-]*$/;
/** Grafana caps a rule uid at 40 characters; the longest built from an id is `slo-<id>-page-fast`. */
const MAX_ID = 40 - "slo--page-fast".length;

/**
 * Multi-window, multi-burn-rate alerts (the Google SRE workbook's): each fires only while both its long and its short
 * window burn the error budget faster than `factor` times the sustainable rate, so it pages on a real burn and stops
 * soon after the burn does. 14.4x over an hour spends 2% of a 30-day budget; 6x over six hours, 5%; 1x over three days
 * is a ticket, not a page.
 */
export const BURN_RATES = [
  { name: "page-fast", factor: 14.4, long: "1h", short: "5m", for: "2m", severity: "critical" },
  { name: "page-slow", factor: 6, long: "6h", short: "30m", for: "15m", severity: "critical" },
  { name: "ticket", factor: 1, long: "3d", short: "6h", for: "1h", severity: "warning" }
] as const;

export interface Objective {
  id: string;
  app: (typeof SLO_APPS)[number];
  kind: "availability" | "latency";
  target: number;
  threshold?: number;
  description?: string;
}

export interface SloFile {
  version?: number;
  window: string;
  objectives: Objective[];
}

const OBJECTIVE_KEYS = new Set(["id", "app", "kind", "target", "threshold", "description"]);

function objectiveErrors(o: Record<string, unknown>, where: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(o)) if (!OBJECTIVE_KEYS.has(key)) errors.push(`${where}: ${key} is not a field of an objective`);
  if (typeof o.id !== "string" || !SLO_ID.test(o.id)) errors.push(`${where}: id is lower-case words joined by "-", e.g. "reader-latency"`);
  else if (o.id.length > MAX_ID) errors.push(`${where}: id is longer than ${MAX_ID} characters, too long for the Grafana rule uids built from it`);
  if (!(SLO_APPS as readonly unknown[]).includes(o.app)) errors.push(`${where}: app is one of ${SLO_APPS.join(", ")}`);
  if (o.kind !== "availability" && o.kind !== "latency") errors.push(`${where}: kind is availability or latency`);
  if (typeof o.target !== "number" || !(o.target > 0)) errors.push(`${where}: target is a share above 0, e.g. 0.995`);
  else if (!(o.target < 1)) errors.push(`${where}: target is a share under 1: 1 leaves no error budget`);
  if (o.kind === "latency") {
    if (o.threshold === undefined) errors.push(`${where}: a latency objective needs threshold, in seconds`);
    else if (!(LATENCY_BUCKETS as readonly unknown[]).includes(o.threshold)) errors.push(`${where}: threshold must be a bucket bound of http_request_duration_seconds (${LATENCY_BUCKETS.join(", ")})`);
  } else if (o.kind === "availability" && o.threshold !== undefined) errors.push(`${where}: an availability objective has no threshold`);
  if (o.description !== undefined && typeof o.description !== "string") errors.push(`${where}: description is text`);
  return errors;
}

/** Everything that stops the release harness from judging against this file; empty when it can. */
export function validateSloText(text: string): string[] {
  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (e) {
    return [`not valid YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`];
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return ["the file is a mapping with window and objectives"];
  const d = doc as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(d)) if (!["version", "window", "objectives"].includes(key)) errors.push(`${key} is not a field of an SLO file`);
  if (d.version !== undefined && d.version !== 1) errors.push("version is 1");
  if (typeof d.window !== "string" || !/^\d+d$/.test(d.window)) errors.push('window is days, e.g. "28d"');
  if (!Array.isArray(d.objectives) || d.objectives.length === 0) return [...errors, "objectives lists at least one"];
  const ids = new Set<string>();
  d.objectives.forEach((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return errors.push(`objective ${i + 1}: is a mapping`);
    const o = raw as Record<string, unknown>;
    const where = typeof o.id === "string" ? `objective ${i + 1} (${o.id})` : `objective ${i + 1}`;
    errors.push(...objectiveErrors(o, where));
    if (typeof o.id === "string") {
      if (ids.has(o.id)) errors.push(`${where}: id is used twice`);
      ids.add(o.id);
    }
  });
  return errors;
}

export function parseSlo(text: string): SloFile {
  const errors = validateSloText(text);
  if (errors.length) throw new Error(`not a valid SLO file:\n  ${errors.join("\n  ")}`);
  return yaml.load(text) as SloFile;
}

// ---- the alerts ------------------------------------------------------------------------------------------------

const seconds = (w: string) => Number(w.slice(0, -1)) * { m: 60, h: 3600, d: 86400 }[w.slice(-1) as "m" | "h" | "d"];
const pct = (x: number) => `${Number((x * 100).toFixed(2))}%`;

/** The share of bad requests for an objective over a window, as PromQL. */
export function badRatio(o: Objective, window: string): string {
  const app = `app="${o.app}"`;
  if (o.kind === "availability") return `sum(rate(http_requests_total{${app},status_code=~"5.."}[${window}])) / sum(rate(http_requests_total{${app}}[${window}]))`;
  return `1 - sum(rate(http_request_duration_seconds_bucket{${app},le="${o.threshold}"}[${window}])) / sum(rate(http_request_duration_seconds_count{${app}}[${window}]))`;
}

/** The bad-request share at which a burn rate fires: factor times the error budget, to six places. */
export const burnThreshold = (o: Objective, factor: number) => Number((factor * (1 - o.target)).toFixed(6));

function what(o: Objective): string {
  return o.kind === "availability" ? "responses that are not 5xx" : `requests under ${o.threshold}s`;
}

const HEALTHZ_RULE = {
  uid: "healthz-failing",
  title: "Health check failing",
  condition: "C",
  data: [
    { refId: "A", relativeTimeRange: { from: 300, to: 0 }, datasourceUid: "prometheus", model: { expr: "up == 0", intervalMs: 1000, maxDataPoints: 43200 } },
    { refId: "C", relativeTimeRange: { from: 300, to: 0 }, datasourceUid: "__expr__", model: { type: "threshold", expression: "A", conditions: [{ evaluator: { type: "gt", params: [0] } }] } }
  ],
  for: "2m",
  labels: { severity: "critical" },
  annotations: { summary: "Service health check failing", description: "{{ $labels.app }} ({{ $labels.instance }}) has been unreachable for 2 minutes" }
};

function sloRule(o: Objective, burn: (typeof BURN_RATES)[number]) {
  const threshold = burnThreshold(o, burn.factor);
  const expr = `(${badRatio(o, burn.long)}) > ${threshold} and (${badRatio(o, burn.short)}) > ${threshold}`;
  const page = burn.severity === "critical";
  return {
    uid: `slo-${o.id}-${burn.name}`,
    title: `${o.id}: error budget burning ${burn.factor}x`,
    condition: "C",
    data: [
      { refId: "A", relativeTimeRange: { from: seconds(burn.long), to: 0 }, datasourceUid: "prometheus", model: { expr, intervalMs: 1000, maxDataPoints: 43200 } },
      { refId: "C", relativeTimeRange: { from: seconds(burn.long), to: 0 }, datasourceUid: "__expr__", model: { type: "threshold", expression: "A", conditions: [{ evaluator: { type: "gt", params: [0] } }] } }
    ],
    // No traffic burns no budget.
    noDataState: "OK",
    execErrState: "Error",
    for: burn.for,
    labels: { severity: burn.severity, slo: o.id, app: o.app },
    annotations: {
      summary: `${o.app}: ${o.id} is burning its error budget ${burn.factor}x too fast${page ? "" : " (a ticket, not a page)"}`,
      description: `Objective: ${pct(o.target)} of ${o.app} ${what(o)}. More than ${pct(threshold)} were bad over both the last ${burn.long} and the last ${burn.short}.`,
      runbook_url: `https://github.com/tutors-sdk/tutors-mono-repo/blob/main/docs/slo.md#${o.id}`
    }
  };
}

const ALERTS_HEADER = `# Grafana alerting rules provisioned at startup. GENERATED from release/slo.yaml by \`pnpm slo:alerts\`:
# edit the objectives there, never this file (\`pnpm check:slo\` fails when the two drift, Rule 0298).
#
# tutors-infra: the health check, which no objective covers.
# tutors-slo: per objective, multi-window burn-rate alerts for that objective's app alone (Rule 0297): page-fast
# (14.4x over 1h and 5m) and page-slow (6x over 6h and 30m) page; ticket (1x over 3d and 6h) does not. Each is labelled
# with its objective (slo) and app, and links its runbook in docs/slo.md.
`;

/** The whole of alerts.yml, from the objectives. Deterministic: the same file gives the same text. */
export function alertsYaml(slo: SloFile): string {
  const doc = {
    apiVersion: 1,
    groups: [
      { orgId: 1, name: "tutors-infra", folder: "Tutors", interval: "1m", rules: [HEALTHZ_RULE] },
      { orgId: 1, name: "tutors-slo", folder: "Tutors", interval: "1m", rules: slo.objectives.flatMap((o) => BURN_RATES.map((b) => sloRule(o, b))) }
    ]
  };
  return `${ALERTS_HEADER}${yaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' })}`;
}

interface AlertFile {
  groups?: { rules?: { uid?: string; labels?: Record<string, string> }[] }[];
}

/**
 * Alerts that do not map to an objective, and objectives with no alert (Rule 0298): every rule but the health check
 * names an objective in its `slo` label, and every objective has each burn rate. Then, that alerts.yml is exactly
 * what `pnpm slo:alerts` writes, so no threshold drifts from its target.
 */
export function sloAlertFindings(slo: SloFile, alertsText: string): string[] {
  const findings: string[] = [];
  const doc = yaml.load(alertsText) as AlertFile;
  const rules = (doc.groups ?? []).flatMap((g) => g.rules ?? []);
  const ids = new Set(slo.objectives.map((o) => o.id));
  for (const rule of rules) {
    if (rule.uid === HEALTHZ_RULE.uid) continue;
    const named = rule.labels?.slo;
    if (!named) findings.push(`alert ${rule.uid ?? "?"} names no objective (labels.slo)`);
    else if (!ids.has(named)) findings.push(`alert ${rule.uid ?? "?"} names ${named}, which is not an objective in ${SLO_FILE}`);
  }
  const uids = new Set(rules.map((r) => r.uid));
  for (const o of slo.objectives) for (const b of BURN_RATES) if (!uids.has(`slo-${o.id}-${b.name}`)) findings.push(`objective ${o.id} has no ${b.name} alert (slo-${o.id}-${b.name})`);
  if (!findings.length && alertsText !== alertsYaml(slo)) findings.push(`${ALERTS_FILE} is not what ${SLO_FILE} generates: run pnpm slo:alerts`);
  return findings;
}

function main(): void {
  const args = process.argv.slice(2);
  const write = args.includes("--write-alerts");
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length > 1 || args.some((a) => a.startsWith("--") && a !== "--write-alerts")) {
    process.stderr.write("FAIL: usage: pnpm check:slo [file] | pnpm slo:alerts\n");
    process.exit(2);
  }
  const arg = files[0] ?? SLO_FILE;
  const file = isAbsolute(arg) ? arg : join(REPO_ROOT, arg);
  if (!existsSync(file)) {
    process.stderr.write(`FAIL: ${arg} is missing. A release carries its service level objectives beside release/claims.yaml.\n`);
    process.exit(1);
  }
  const text = readFileSync(file, "utf8");
  const errors = validateSloText(text);
  if (errors.length) {
    process.stderr.write(`FAIL: ${arg} is not an SLO file the release harness accepts:\n`);
    for (const error of errors) process.stderr.write(`  ${error}\n`);
    process.exit(1);
  }
  const slo = parseSlo(text);
  const alerts = join(REPO_ROOT, ALERTS_FILE);
  if (write) {
    writeFileSync(alerts, alertsYaml(slo));
    process.stdout.write(`OK: wrote ${ALERTS_FILE} from ${arg} (${slo.objectives.length} objectives, ${slo.objectives.length * BURN_RATES.length} burn-rate alerts).\n`);
    return;
  }
  if (files.length === 0) {
    const findings = sloAlertFindings(slo, readFileSync(alerts, "utf8"));
    if (findings.length) {
      process.stderr.write(`FAIL: the alerts do not map to the objectives:\n`);
      for (const f of findings) process.stderr.write(`  ${f}\n`);
      process.exit(1);
    }
  }
  process.stdout.write(`OK: ${arg} is valid (${slo.objectives.length} objective${slo.objectives.length === 1 ? "" : "s"})${files.length === 0 ? `, and ${ALERTS_FILE} matches it` : ""}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
