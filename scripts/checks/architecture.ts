import { createRequire } from "node:module";
import { cruise, type ICruiseOptions, type IResolveOptions } from "dependency-cruiser";
import { REPO_ROOT } from "./lib/repo.ts";

const require = createRequire(import.meta.url);

export interface ArchitectureViolation {
  rule: string;
  from: string;
  to: string;
}

/** `rule: from -> to`, the line format of the known-violations baseline. */
export function formatViolation(violation: ArchitectureViolation): string {
  return `${violation.rule}: ${violation.from} -> ${violation.to}`;
}

/**
 * Run the rules in `.dependency-cruiser.cjs` over `roots` (relative to
 * `baseDir`). `alias` maps bare specifiers to files, so fixtures can stand in
 * for workspace packages without a node_modules tree.
 */
export async function checkArchitecture(
  roots: string[],
  { baseDir = REPO_ROOT, alias }: { baseDir?: string; alias?: Record<string, string> } = {}
): Promise<ArchitectureViolation[]> {
  const config = require(`${REPO_ROOT}/.dependency-cruiser.cjs`);
  const { enhancedResolveOptions, ...options } = config.options;

  const cruiseOptions: ICruiseOptions = {
    ...options,
    enhancedResolveOptions,
    baseDir,
    ruleSet: { forbidden: config.forbidden },
    validate: true,
    outputType: "json"
  };
  const resolveOptions: Partial<IResolveOptions> = {
    ...enhancedResolveOptions,
    ...(alias ? { alias } : {})
  };

  const { output } = await cruise(roots, cruiseOptions, resolveOptions);
  const result = typeof output === "string" ? JSON.parse(output) : output;
  return result.summary.violations
    .map((v: { rule: { name: string }; from: string; to: string }) => ({ rule: v.rule.name, from: v.from, to: v.to }))
    .sort((a: ArchitectureViolation, b: ArchitectureViolation) => formatViolation(a).localeCompare(formatViolation(b)));
}
