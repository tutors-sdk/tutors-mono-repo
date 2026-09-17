/**
 * Ratchet helpers shared by the runway checks.
 *
 * A baseline lists the violations that existed when a check was introduced.
 * The check fails on anything not in the baseline (a regression) and on any
 * baseline entry that no longer occurs (a fix nobody recorded), so the
 * baseline can only shrink.
 */
export interface RatchetResult {
  /** Present now, absent from the baseline: new violations. */
  added: string[];
  /** In the baseline, no longer present: delete these lines from the baseline. */
  stale: string[];
}

export function ratchet(current: Iterable<string>, baseline: Iterable<string>): RatchetResult {
  const now = new Set(current);
  const known = new Set(baseline);
  return {
    added: [...now].filter((entry) => !known.has(entry)).sort(),
    stale: [...known].filter((entry) => !now.has(entry)).sort()
  };
}

/** A human explanation of a failed ratchet, for assertion messages. */
export function describeRatchet(name: string, baselineFile: string, result: RatchetResult): string {
  const lines: string[] = [];
  if (result.added.length > 0) {
    lines.push(`${name}: ${result.added.length} new violation(s). Fix them rather than adding them to ${baselineFile}.`);
    lines.push(...result.added.map((entry) => `  + ${entry}`));
  }
  if (result.stale.length > 0) {
    lines.push(`${name}: ${result.stale.length} baseline entries no longer occur. Delete them from ${baselineFile}.`);
    lines.push(...result.stale.map((entry) => `  - ${entry}`));
  }
  return lines.join("\n");
}
