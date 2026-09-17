import ts from "typescript";
import yaml from "js-yaml";
import { z } from "zod";

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
    requestId: z.string().min(1).optional()
  })
  .loose();

/** The one line the request logger writes when a request finishes. */
export const RequestCompletedSchema = LogLineSchema.extend({
  message: z.literal("request completed"),
  requestId: z.string().min(1),
  method: z.string().min(1),
  path: z.string().startsWith("/"),
  route: z.string().nullable(),
  status: z.number().int().min(100).max(599),
  duration_ms: z.number().nonnegative()
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
  { pattern: /^Listening on https?:\/\/\S+$/, reason: "@sveltejs/adapter-node prints this once at startup, outside the app's logger" }
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

/* ---------------- request correlation ---------------- */

/**
 * The contract for one failed request: every line about it carries its
 * request id, and exactly one error-level line carries a stack. Zero means
 * the failure is invisible; more than one means one fault pages twice.
 */
export function failedRequestFindings(lines: LogLine[], requestId: string): string[] {
  const findings: string[] = [];
  const missingId = lines.filter((line) => line.requestId !== requestId);
  if (missingId.length > 0) {
    findings.push(`${missingId.length} line(s) without request id ${requestId}: ${missingId.map((l) => l.message).join(", ")}`);
  }
  const withStack = lines.filter((line) => line.level === "error" && typeof line.stack === "string" && line.stack !== "");
  if (withStack.length !== 1) findings.push(`expected exactly 1 error line with a stack, found ${withStack.length}`);
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
