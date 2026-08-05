/**
 * Byte-level binary comparator using SHA-256 hashing.
 * Recursively walks two directory trees and reports differences.
 */

import type { ComparisonResult } from "./json-comparator.ts";

async function sha256(filePath: string): Promise<string> {
  const data = await Deno.readFile(filePath);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function walkFiles(dir: string, prefix = ""): Promise<Map<string, number>> {
  const files = new Map<string, number>();

  for await (const entry of Deno.readDir(dir)) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      const nested = await walkFiles(`${dir}/${entry.name}`, relativePath);
      for (const [path, size] of nested) {
        files.set(path, size);
      }
    } else if (entry.isFile) {
      const stat = await Deno.stat(`${dir}/${entry.name}`);
      files.set(relativePath, stat.size);
    }
  }

  return files;
}

export async function compareBinaryDirectories(
  baselineDir: string,
  candidateDir: string
): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  const baselineFiles = await walkFiles(baselineDir);
  const candidateFiles = await walkFiles(candidateDir);

  for (const [path] of baselineFiles) {
    if (!candidateFiles.has(path)) {
      results.push({ path, severity: "error", message: "File missing in candidate" });
    }
  }

  for (const [path] of candidateFiles) {
    if (!baselineFiles.has(path)) {
      results.push({ path, severity: "info", message: "New file in candidate" });
    }
  }

  for (const [path, baselineSize] of baselineFiles) {
    if (!candidateFiles.has(path)) continue;

    const candidateSize = candidateFiles.get(path)!;
    const baselineHash = await sha256(`${baselineDir}/${path}`);
    const candidateHash = await sha256(`${candidateDir}/${path}`);

    if (baselineHash === candidateHash) {
      continue;
    }

    const sizeDelta = candidateSize - baselineSize;
    const pctChange = baselineSize > 0
      ? ((Math.abs(sizeDelta) / baselineSize) * 100).toFixed(1)
      : "N/A";

    results.push({
      path,
      severity: "warning",
      message: `Binary diff: size ${baselineSize} → ${candidateSize} (${sizeDelta >= 0 ? "+" : ""}${sizeDelta} bytes, ${pctChange}% change)`,
    });
  }

  return results;
}
