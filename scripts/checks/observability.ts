import ts from "typescript";
import yaml from "js-yaml";
import { z } from "zod";
import { CORE_LOG_KEYS, DEFAULT_LOG_EVENT, LOG_EVENT_FIELDS } from "../../packages/svelte/utils/logger/src/index.ts";

/**
 * Observability contracts (runway tier K). Logging and metrics rot silently
 * because nothing fails when they break; these checks make them fail.
 */

/* ---------------- log schema ---------------- */

/** Every JSON log line an app writes in production. */
export const LogLineSchema = z
  .object({
    timestamp: z.iso.datetime(),
    level: z.enum(["debug", "info", "warn", "error"]),
    message: z.string().min(1),
    app: z.string().regex(/^tutors-[a-z]+$/).optional(),
    environment: z.enum(["development", "production"]).optional(),
    requestId: z.string().min(1).nullable().optional()
  })
  .loose();

/**
 * The one line the request logger writes when a request finishes. `loadError`
 * marks a server error SvelteKit answered with a non-5xx status (a failing
 * server load inside a 200 `__data.json`); such a line is always error level.
 */
export const RequestCompletedSchema = LogLineSchema.extend({
  message: z.literal("request completed"),
  requestId: z.string().min(1),
  method: z.string().min(1),
  path: z.string().startsWith("/"),
  route: z.string().nullable(),
  status: z.number().int().min(100).max(599),
  duration_ms: z.number().nonnegative(),
  slow: z.boolean(),
  loadError: z.boolean()
}).refine((line) => line.loadError !== true || line.level === "error", {
  path: ["level"],
  message: "a completion line with loadError must be logged at error"
});

export type LogLine = z.infer<typeof LogLineSchema>;

/** Schema violations for a batch of parsed log lines, as `line N: problem`. */
export function logSchemaFindings(lines: unknown[]): string[] {
  return lines.flatMap((line, index) => {
    const base = LogLineSchema.safeParse(line);
    const schema = (line as { message?: unknown })?.message === "request completed" ? RequestCompletedSchema : LogLineSchema;
    const result = base.success ? schema.safeParse(line) : base;
    return result.success
      ? []
      : result.error.issues.map((issue) => `line ${index + 1}: ${issue.path.join(".") || "(root)"} ${issue.message}`);
  });
}

/**
 * Plain-text lines written by code Tutors does not own. Each is a blind spot,
 * so each needs a reason.
 */
export const NON_JSON_ALLOWED: readonly { pattern: RegExp; reason: string }[] = [
  // Empty since installProcessLogging() captures console output: adapter-node's
  // "Listening on ..." banner now arrives as an `event: "console"` line.
];

/** Parse container stdout: JSON lines are returned, anything else is reported as a finding. */
export function parseLogStream(stdout: string): { lines: unknown[]; findings: string[] } {
  const lines: unknown[] = [];
  const findings: string[] = [];
  stdout
    .split(/\r?\n/)
    .filter((raw) => raw.trim() !== "" && !NON_JSON_ALLOWED.some(({ pattern }) => pattern.test(raw.trim())))
    .forEach((raw, index) => {
      try {
        lines.push(JSON.parse(raw));
      } catch {
        findings.push(`line ${index + 1}: not JSON: ${raw.slice(0, 120)}`);
      }
    });
  return { lines, findings };
}

/* ---------------- container log contract ---------------- */

const nullableString = z.string().nullable();

/** The core keys every line from a running container starts with (deploy/README.md, "Log contract"). */
const ContainerCoreSchema = z
  .object({
    timestamp: z.iso.datetime(),
    level: z.enum(["debug", "info", "warn", "error"]),
    event: z.string().regex(/^[a-z]+(\.[a-zA-Z]+)*$/),
    message: z.string(),
    app: z.string().regex(/^tutors-[a-z]+$/),
    environment: z.enum(["development", "production"]),
    hostname: nullableString,
    pid: z.number().int().positive().nullable(),
    requestId: z.string().min(1).nullable()
  })
  .loose();

/** Value types of the event-specific fields. A field may hold null only where the contract says so. */
const EVENT_FIELD_TYPES: Record<string, z.ZodType> = {
  logLevel: z.enum(["debug", "info", "warn", "error"]),
  node: nullableString,
  version: z.string(),
  authMode: z.string(),
  method: nullableString,
  path: nullableString,
  route: nullableString,
  status: z.number().int().min(100).max(599).nullable(),
  duration_ms: z.number().nonnegative(),
  slow: z.boolean(),
  loadError: z.boolean(),
  reason: nullableString,
  error: z.string(),
  stack: nullableString,
  consoleMethod: z.enum(["log", "info", "debug", "warn", "error", "trace"]),
  warningName: nullableString
};

/**
 * The contract the release harness relies on, checked against real container
 * output: every line starts with the core keys in order, and a line of a known
 * `event` kind carries exactly that kind's fields, in order, with the right
 * types. Only `event: "log"` lines (plain `log.info(...)` calls) are free-form.
 */
export function containerLogFindings(lines: unknown[]): string[] {
  const findings: string[] = [];
  lines.forEach((line, index) => {
    const at = `line ${index + 1}`;
    const core = ContainerCoreSchema.safeParse(line);
    if (!core.success) {
      findings.push(...core.error.issues.map((issue) => `${at}: ${issue.path.join(".") || "(root)"} ${issue.message}`));
      return;
    }
    const record = line as Record<string, unknown>;
    const keys = Object.keys(record);
    const head = keys.slice(0, CORE_LOG_KEYS.length);
    if (head.join() !== CORE_LOG_KEYS.join()) {
      findings.push(`${at}: core keys are [${head.join(", ")}], expected [${CORE_LOG_KEYS.join(", ")}]`);
      return;
    }
    const event = record.event as string;
    if (event === DEFAULT_LOG_EVENT) return;
    const shape = LOG_EVENT_FIELDS[event];
    if (!shape) {
      findings.push(`${at}: event "${event}" is not in the log contract (LOG_EVENT_FIELDS)`);
      return;
    }
    const extras = keys.slice(CORE_LOG_KEYS.length);
    const expected = [...shape.required, ...(shape.optional ?? []).filter((key) => extras.includes(key))];
    if (extras.join() !== expected.join()) {
      findings.push(`${at}: ${event} carries [${extras.join(", ")}], expected [${expected.join(", ")}]`);
      return;
    }
    for (const key of extras) {
      const result = EVENT_FIELD_TYPES[key]?.safeParse(record[key]);
      if (result && !result.success) findings.push(`${at}: ${event}.${key} ${result.error.issues[0].message}`);
    }
  });
  return findings;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * One request, seen from both ends: the response carries exactly one
 * `x-request-id`, it is the caller's id (or a fresh UUID when the caller sent
 * none), and every log line about that request path carries the same id.
 */
export function requestCorrelationFindings(
  label: string,
  sent: string | undefined,
  header: string | null,
  lines: { requestId?: string | null; path?: unknown }[],
  path: string
): string[] {
  if (!header) return [`${label}: response has no x-request-id header`];
  const findings: string[] = [];
  if (header.includes(",")) findings.push(`${label}: x-request-id was set more than once (${header})`);
  if (sent !== undefined && header !== sent) findings.push(`${label}: response echoed ${header}, the caller sent ${sent}`);
  if (sent === undefined && !UUID.test(header)) findings.push(`${label}: generated request id ${header} is not a UUID`);
  const about = lines.filter((line) => line.path === path);
  if (about.length === 0) findings.push(`${label}: no log line for ${path}`);
  const strangers = about.filter((line) => line.requestId !== header);
  if (strangers.length > 0) {
    findings.push(`${label}: ${strangers.length} of ${about.length} line(s) for ${path} do not carry request id ${header}`);
  }
  return findings;
}

/* ---------------- metrics contract ---------------- */

/**
 * Every series an app exports itself, exactly. A new app-level metric is added
 * here and to deploy/README.md ("Metrics contract") in the same change.
 */
export const APP_SERIES: readonly string[] = [
  "http_request_duration_seconds_bucket",
  "http_request_duration_seconds_count",
  "http_request_duration_seconds_sum",
  "http_requests_in_flight",
  "http_requests_total"
];

/** App-level series are named `http_*` or `tutors_*`; nothing else may sit outside the runtime prefixes. */
export const APP_SERIES_PATTERN = /^(http|tutors)_/;

/**
 * Runtime series from the default collectors. Their values (and, for GC kinds
 * and handle types, their label sets) describe the process and the moment, so
 * a comparison masks them as a group by these prefixes.
 */
export const RUNTIME_SERIES_PATTERN = /^(process|nodejs)_/;

/** Labels allowed on app-level series; none of them can carry a per-request or per-process value. */
export const APP_SERIES_LABELS: ReadonlySet<string> = new Set(["method", "route", "status_code", "le"]);

/** Series and labels in an exposition that break the metrics contract. */
export function metricsContractFindings(exposition: string, options: { requireAll?: boolean } = {}): string[] {
  const findings: string[] = [];
  const seen = new Set<string>();
  for (const line of exposition.split(/\r?\n/)) {
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s/);
    if (!match) {
      findings.push(`unparseable sample: ${line.slice(0, 80)}`);
      continue;
    }
    const [, name, labels = ""] = match;
    if (RUNTIME_SERIES_PATTERN.test(name)) continue;
    if (!seen.has(name) && !APP_SERIES.includes(name)) {
      findings.push(
        APP_SERIES_PATTERN.test(name)
          ? `series ${name} is not in the pinned app-level set (APP_SERIES)`
          : `series ${name} has neither an app prefix (http_, tutors_) nor a runtime prefix (process_, nodejs_)`
      );
    }
    seen.add(name);
    for (const label of labels.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) {
      if (!APP_SERIES_LABELS.has(label[1])) findings.push(`series ${name} carries label ${label[1]}, which is not in the contract`);
      if (label[1] === "route" && label[2] !== "unmatched" && !label[2].startsWith("/")) {
        findings.push(`series ${name} has route="${label[2]}", expected a route id or "unmatched"`);
      }
    }
  }
  if (options.requireAll) {
    for (const name of APP_SERIES) if (!seen.has(name)) findings.push(`series ${name} is missing`);
  }
  return [...new Set(findings)];
}

/* ---------------- log message stability ---------------- */

const LOG_RECEIVERS = new Set(["log", "logger"]);
const LOG_LEVEL_METHODS = new Set(["debug", "info", "warn", "error"]);

/**
 * `log.<level>(...)` calls whose message is not a plain string literal. A
 * message is what a collector groups and diffs lines by, so text that varies
 * per request (an interpolated course id, an `Error`'s own message passed as
 * the first argument) turns one kind of line into many. Variable data belongs
 * in the context object: `log.error("Error fetching course", { courseId })`.
 * Returns `line N: <call>` for each offender.
 */
export function unstableLogMessageFindings(source: string, fileName = "source.ts"): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const findings: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      LOG_RECEIVERS.has(node.expression.expression.text) &&
      LOG_LEVEL_METHODS.has(node.expression.name.text)
    ) {
      const first = node.arguments[0];
      if (first && !ts.isStringLiteral(first) && !ts.isNoSubstitutionTemplateLiteral(first)) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
        findings.push(`line ${line + 1}: ${node.getText(file).split("\n")[0].slice(0, 80)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}

/* ---------------- request correlation ---------------- */

/**
 * The contract for one failed request: every line about it carries its
 * request id, and exactly one error-level line carries a stack. Zero means
 * the failure is invisible; more than one means one fault pages twice. The
 * completion line must also record the failure, either as a 5xx status or,
 * when SvelteKit answered 200 with an error node, as `loadError: true`.
 */
export function failedRequestFindings(lines: LogLine[], requestId: string): string[] {
  const findings: string[] = [];
  const missingId = lines.filter((line) => line.requestId !== requestId);
  if (missingId.length > 0) {
    findings.push(`${missingId.length} line(s) without request id ${requestId}: ${missingId.map((l) => l.message).join(", ")}`);
  }
  const withStack = lines.filter((line) => line.level === "error" && typeof line.stack === "string" && line.stack !== "");
  if (withStack.length !== 1) findings.push(`expected exactly 1 error line with a stack, found ${withStack.length}`);
  for (const line of lines.filter((l) => l.message === "request completed")) {
    const status = typeof line.status === "number" ? line.status : undefined;
    if ((status === undefined || status < 500) && line.loadError !== true) {
      findings.push(`"request completed" records status ${status} at ${line.level} without loadError, so the failure looks like a success`);
    }
  }
  return findings;
}

/**
 * Static check of an app's `hooks.server.ts`: the request logger is the first
 * handle in `sequence(...)` (so every other hook runs inside it), the metrics
 * handle is present, `handleError` routes through `logRequestError`, and the
 * app names itself in logs.
 */
export function hookWiringFindings(app: string, source: string): string[] {
  const file = ts.createSourceFile("hooks.server.ts", source, ts.ScriptTarget.Latest, true);
  const findings: string[] = [];
  const loggerVariables = new Set<string>();
  let sequenceArgs: ts.NodeArray<ts.Expression> | undefined;
  let handleErrorBody: string | undefined;
  let appName: string | undefined;

  const isCall = (node: ts.Node, name: string): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isCall(node.initializer, "createRequestLogger")) loggerVariables.add(node.name.text);
      if (node.name.text === "handle" && isCall(node.initializer, "sequence")) sequenceArgs = node.initializer.arguments;
      if (node.name.text === "handleError") handleErrorBody = node.initializer.getText(file);
    }
    if (isCall(node, "setAppName") && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      appName = node.arguments[0].text;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  if (!sequenceArgs) {
    findings.push(`${app}: handle is not built with sequence(...)`);
  } else {
    const first = sequenceArgs[0];
    const firstIsLogger =
      first !== undefined &&
      (isCall(first, "createRequestLogger") || (ts.isIdentifier(first) && loggerVariables.has(first.text)));
    if (!firstIsLogger) findings.push(`${app}: the request logger is not the first handle in sequence(...)`);
    if (!sequenceArgs.some((arg) => ts.isIdentifier(arg) && arg.text === "metricsHandle")) {
      findings.push(`${app}: metricsHandle is missing from sequence(...)`);
    }
  }
  if (!handleErrorBody?.includes("logRequestError(")) findings.push(`${app}: handleError does not call logRequestError`);
  if (appName !== `tutors-${app}`) findings.push(`${app}: setAppName("tutors-${app}") is missing (found ${appName ?? "none"})`);
  return findings;
}

/* ---------------- alert / metrics parity ---------------- */

/** Series Prometheus creates itself for every scrape target; no app exports them. */
export const PROMETHEUS_SYNTHETIC_SERIES: ReadonlySet<string> = new Set([
  "up",
  "scrape_duration_seconds",
  "scrape_samples_scraped",
  "scrape_samples_post_metric_relabeling",
  "scrape_series_added"
]);

const PROMQL_KEYWORDS = new Set([
  "by", "without", "on", "ignoring", "group_left", "group_right", "bool", "and", "or", "unless", "offset",
  "sum", "min", "max", "avg", "count", "stddev", "stdvar", "topk", "bottomk", "quantile", "count_values", "group",
  "inf", "nan"
]);

/** Metric names referenced by a PromQL expression. */
export function promqlMetricNames(expr: string): string[] {
  const stripped = expr
    .replace(/"(?:[^"\\]|\\.)*"/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\b(by|without|on|ignoring|group_left|group_right)\s*\([^)]*\)/g, "");
  const names = new Set<string>();
  for (const match of stripped.matchAll(/(?<![\w:.])([a-zA-Z_:][a-zA-Z0-9_:]*)(?![\w:])(?!\s*\()/g)) {
    if (!PROMQL_KEYWORDS.has(match[1].toLowerCase())) names.add(match[1]);
  }
  return [...names].sort();
}

/** Series names present in Prometheus text exposition output, including histogram `_bucket`/`_sum`/`_count`. */
export function exposedSeries(exposition: string): Set<string> {
  const names = new Set<string>();
  for (const line of exposition.split(/\r?\n/)) {
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/);
    if (match) names.add(match[1]);
  }
  return names;
}

interface GrafanaAlertFile {
  groups?: { rules?: { uid?: string; title?: string; data?: { datasourceUid?: string; model?: { expr?: string } }[] }[] }[];
}

/** Every metric a Grafana alert rule queries from Prometheus. */
export function alertMetricReferences(alertsYaml: string): { alert: string; metric: string }[] {
  const doc = yaml.load(alertsYaml) as GrafanaAlertFile;
  return (doc.groups ?? []).flatMap((group) =>
    (group.rules ?? []).flatMap((rule) =>
      (rule.data ?? [])
        .filter((query) => query.datasourceUid !== "__expr__" && typeof query.model?.expr === "string")
        .flatMap((query) => promqlMetricNames(query.model!.expr!).map((metric) => ({ alert: rule.uid ?? rule.title ?? "?", metric })))
    )
  );
}

/** Alerts that would never fire because a series they query is not exported. */
export function alertParityFindings(alertsYaml: string, exposition: string): string[] {
  const exposed = exposedSeries(exposition);
  return alertMetricReferences(alertsYaml)
    .filter(({ metric }) => !PROMETHEUS_SYNTHETIC_SERIES.has(metric) && !exposed.has(metric))
    .map(({ alert, metric }) => `alert ${alert} queries ${metric}, which /metrics does not export`);
}
