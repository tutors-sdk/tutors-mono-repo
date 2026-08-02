/**
 * Deep semantic JSON comparator for artifact regression testing.
 * Normalises keys, ignores timestamps, and classifies differences by severity.
 */

export interface ComparisonResult {
  path: string;
  severity: "error" | "warning" | "info";
  message: string;
}

function normaliseJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(normaliseJson);

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    if (key === "lastUpdated" || key === "timestamp" || key === "generatedAt") continue;
    sorted[key] = normaliseJson((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

function diffObjects(baseline: unknown, candidate: unknown, path: string, results: ComparisonResult[]): void {
  if (baseline === candidate) return;

  if (typeof baseline !== typeof candidate) {
    results.push({ path, severity: "error", message: `Type changed: ${typeof baseline} -> ${typeof candidate}` });
    return;
  }

  if (Array.isArray(baseline) && Array.isArray(candidate)) {
    if (baseline.length !== candidate.length) {
      results.push({ path, severity: "warning", message: `Array length changed: ${baseline.length} -> ${candidate.length}` });
    }
    const minLen = Math.min(baseline.length, candidate.length);
    for (let i = 0; i < minLen; i++) {
      diffObjects(baseline[i], candidate[i], `${path}[${i}]`, results);
    }
    return;
  }

  if (typeof baseline === "object" && baseline !== null && candidate !== null) {
    const baseKeys = new Set(Object.keys(baseline as Record<string, unknown>));
    const candKeys = new Set(Object.keys(candidate as Record<string, unknown>));

    for (const key of baseKeys) {
      if (!candKeys.has(key)) {
        results.push({ path: `${path}.${key}`, severity: "error", message: "Field removed" });
      } else {
        diffObjects(
          (baseline as Record<string, unknown>)[key],
          (candidate as Record<string, unknown>)[key],
          `${path}.${key}`,
          results
        );
      }
    }

    for (const key of candKeys) {
      if (!baseKeys.has(key)) {
        results.push({ path: `${path}.${key}`, severity: "info", message: "New field added" });
      }
    }
    return;
  }

  if (baseline !== candidate) {
    const isRoute = path.includes("route") || path.includes("path") || path.includes("url");
    results.push({
      path,
      severity: isRoute ? "error" : "warning",
      message: `Value changed: ${JSON.stringify(baseline)} -> ${JSON.stringify(candidate)}`
    });
  }
}

export async function compareDirectoryContents(baselineDir: string, candidateDir: string): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  const baselineFiles = new Set<string>();
  for await (const entry of Deno.readDir(baselineDir)) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      baselineFiles.add(entry.name);
    }
  }

  const candidateFiles = new Set<string>();
  for await (const entry of Deno.readDir(candidateDir)) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      candidateFiles.add(entry.name);
    }
  }

  for (const file of baselineFiles) {
    if (!candidateFiles.has(file)) {
      results.push({ path: file, severity: "error", message: "File missing in candidate" });
    }
  }

  for (const file of candidateFiles) {
    if (!baselineFiles.has(file)) {
      results.push({ path: file, severity: "info", message: "New file in candidate" });
    }
  }

  for (const file of baselineFiles) {
    if (!candidateFiles.has(file)) continue;

    try {
      const baselineContent = JSON.parse(await Deno.readTextFile(`${baselineDir}/${file}`));
      const candidateContent = JSON.parse(await Deno.readTextFile(`${candidateDir}/${file}`));

      const normBaseline = normaliseJson(baselineContent);
      const normCandidate = normaliseJson(candidateContent);

      diffObjects(normBaseline, normCandidate, file, results);
    } catch (e) {
      results.push({ path: file, severity: "error", message: `Parse error: ${e}` });
    }
  }

  return results;
}
