/**
 * API Surface Tracker for Tutors JSR Packages
 *
 * Extracts all public exports from JSR library packages and generates
 * deterministic API report files. Inspired by @microsoft/api-extractor
 * but works directly with Deno-style TypeScript sources (no .d.ts needed).
 *
 * Usage:
 *   pnpm api-report          # Generate/update baseline reports in etc/
 *   pnpm api-report:check    # Check that reports are up to date (CI mode)
 *
 * Tracked packages:
 *   - @tutors/tutors-model-lib (packages/jsr/model)
 *   - @tutors/tutors-gen-lib   (packages/jsr/gen)
 *   - @tutors/tutors-time-lib  (packages/jsr/time)
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const ETC_DIR = path.join(ROOT, "etc");

// ---- Configuration ----

interface PackageConfig {
  /** JSR package name */
  name: string;
  /** Directory relative to repo root */
  dir: string;
  /** Entry point relative to package dir */
  entry: string;
  /** Output report filename */
  reportFile: string;
}

const TRACKED_PACKAGES: PackageConfig[] = [
  {
    name: "@tutors/tutors-model-lib",
    dir: "packages/jsr/model",
    entry: "src/tutors.ts",
    reportFile: "tutors-model-lib.api.md",
  },
  {
    name: "@tutors/tutors-gen-lib",
    dir: "packages/jsr/gen",
    entry: "src/tutors.ts",
    reportFile: "tutors-gen-lib.api.md",
  },
  {
    name: "@tutors/tutors-time-lib",
    dir: "packages/jsr/time",
    entry: "src/index.ts",
    reportFile: "tutors-time-lib.api.md",
  },
];

// ---- Types ----

interface ExportedSymbol {
  /** Symbol name */
  name: string;
  /** Kind of export */
  kind: "function" | "class" | "interface" | "type" | "const" | "let" | "enum" | "variable";
  /** The full declaration signature (cleaned up) */
  signature: string;
  /** Source file relative to package directory */
  sourceFile: string;
}

// ---- Source Parsing ----

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Strip block comments and single-line comments from source code,
 * preserving line structure. Respects string literals so that
 * '//' inside strings (e.g., "https://") is not treated as a comment.
 */
function stripComments(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    // Handle string literals - pass them through unchanged
    if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
      const quote = source[i];
      result += source[i];
      i++;
      while (i < source.length) {
        if (source[i] === "\\" && quote !== "`") {
          result += source[i] + (source[i + 1] || "");
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          result += source[i];
          i++;
          break;
        }
        // Template literal: handle ${...} expressions
        if (quote === "`" && source[i] === "$" && source[i + 1] === "{") {
          let depth = 0;
          result += source[i]; i++;
          while (i < source.length) {
            if (source[i] === "{") depth++;
            else if (source[i] === "}") {
              depth--;
              if (depth === 0) { result += source[i]; i++; break; }
            }
            result += source[i];
            i++;
          }
          continue;
        }
        result += source[i];
        i++;
      }
      continue;
    }

    // Handle block comments
    if (source[i] === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") result += "\n"; // preserve newlines
        i++;
      }
      i += 2; // skip */
      continue;
    }

    // Handle single-line comments
    if (source[i] === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    result += source[i];
    i++;
  }

  return result;
}

/**
 * Resolve a relative import path to an absolute file path.
 * Handles Deno-style .ts extensions in imports.
 */
function resolveImportPath(fromFile: string, importPath: string): string | null {
  // Only handle relative imports
  if (!importPath.startsWith("./") && !importPath.startsWith("../")) {
    return null;
  }

  const dir = path.dirname(fromFile);
  let resolved = path.resolve(dir, importPath);

  // If the path already has .ts extension, use it directly
  if (resolved.endsWith(".ts") && fs.existsSync(resolved)) {
    return resolved;
  }

  // Try common extensions
  for (const ext of [".ts", "/index.ts", ".tsx", "/index.tsx"]) {
    const candidate = resolved + ext;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Try the path as-is (might be a directory with index.ts)
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    const indexPath = path.join(resolved, "index.ts");
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Extract a function signature: everything from 'export' through the closing paren
 * and return type, but NOT the function body.
 */
function extractFunctionSignature(source: string, startIndex: number): string {
  // Find the function parameter list by matching balanced parentheses,
  // respecting string literals.
  let i = startIndex;
  // Advance to the opening paren
  while (i < source.length && source[i] !== "(") i++;
  if (i >= source.length) return "";

  // Match balanced parens, skipping over string literals
  let depth = 0;
  let parenEnd = i;
  for (; parenEnd < source.length; parenEnd++) {
    const ch = source[parenEnd];
    // Skip string literals inside parameters (e.g., default values)
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      parenEnd++;
      while (parenEnd < source.length) {
        if (source[parenEnd] === "\\" && q !== "`") { parenEnd++; }
        else if (source[parenEnd] === q) { break; }
        parenEnd++;
      }
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) { parenEnd++; break; }
    }
  }

  // After closing paren, look for return type annotation (: Type)
  // Scan character by character until we hit { or end of line
  let returnType = "";
  let j = parenEnd;
  // Skip whitespace
  while (j < source.length && (source[j] === " " || source[j] === "\t")) j++;
  if (j < source.length && source[j] === ":") {
    // Capture return type: everything up to the first { at depth 0
    let rtStart = j;
    let rtDepth = 0;
    j++; // skip the :
    while (j < source.length) {
      const ch = source[j];
      if (ch === "<") rtDepth++;
      else if (ch === ">") rtDepth--;
      else if (ch === "{" && rtDepth === 0) break;
      else if (ch === "\n") break;
      j++;
    }
    returnType = source.slice(rtStart, j).trim();
  }

  const beforeParen = source.slice(startIndex, i);
  const params = source.slice(i, parenEnd);

  // Build the signature from parts, stripping default values for cleanliness
  let paramStr = params;
  // Clean up default values: replace ` = <value>` with just the type
  // But keep simple defaults visible (numbers, strings, booleans)
  paramStr = paramStr.replace(/\s*=\s*"[^"]*"/g, ""); // strip string defaults
  paramStr = paramStr.replace(/\s*=\s*'[^']*'/g, "");  // strip string defaults
  paramStr = paramStr.replace(/\s*=\s*`[^`]*`/g, "");  // strip template defaults

  let sig = (beforeParen + paramStr).replace(/\s+/g, " ").trim();
  if (returnType) {
    sig += " " + returnType;
  }

  return sig;
}

/**
 * Extract a type alias signature: 'export type Name = <type expression>'
 * Handles inline object types with balanced braces.
 */
function extractTypeSignature(source: string, startIndex: number): string {
  let i = startIndex;
  let depth = 0;
  let result = "";
  let foundEquals = false;

  while (i < source.length) {
    const ch = source[i];

    if (ch === "=") foundEquals = true;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0 && foundEquals) {
        // End of inline object type
        result = source.slice(startIndex, i + 1);
        break;
      }
    }

    if (ch === ";" && depth === 0) {
      result = source.slice(startIndex, i);
      break;
    }

    // For simple type aliases without braces (e.g., type X = Y | Z)
    if (ch === "\n" && depth === 0 && foundEquals) {
      // Check if the next line starts a new export or declaration
      const rest = source.slice(i + 1, i + 50).trimStart();
      if (/^(export\s|\/\/|\/\*|$)/.test(rest) || rest === "") {
        result = source.slice(startIndex, i);
        break;
      }
    }

    i++;
  }

  if (!result) {
    result = source.slice(startIndex, Math.min(startIndex + 200, source.length));
  }

  return result
    .replace(/\s+/g, " ")
    .replace(/;\s*$/, "")
    .trim();
}

/**
 * Extract a class/interface/enum declaration header (not the body).
 */
function extractDeclSignature(source: string, startIndex: number): string {
  let i = startIndex;
  while (i < source.length && source[i] !== "{") i++;
  const header = source.slice(startIndex, i);
  return header.replace(/\s+/g, " ").trim();
}

/**
 * Parse a TypeScript source file and extract all exported symbols.
 * Follows `export * from` chains to collect re-exported symbols.
 */
function extractExportsFromFile(
  filePath: string,
  pkgDir: string,
  visited: Set<string> = new Set()
): ExportedSymbol[] {
  if (visited.has(filePath)) return [];
  visited.add(filePath);

  const source = readFileSafe(filePath);
  if (!source) return [];

  const cleaned = stripComments(source);
  const symbols: ExportedSymbol[] = [];
  const relativeFile = path.relative(pkgDir, filePath).replace(/\\/g, "/");

  // --- Handle `export * from "./..."` (re-exports) ---
  const reExportPattern = /export\s+\*\s+from\s+["']([^"']+)["']/g;
  let reExportMatch;
  while ((reExportMatch = reExportPattern.exec(cleaned)) !== null) {
    const importPath = reExportMatch[1];
    const resolved = resolveImportPath(filePath, importPath);
    if (resolved) {
      const reExported = extractExportsFromFile(resolved, pkgDir, visited);
      symbols.push(...reExported);
    }
  }

  // --- Handle `export { name } from "./..."` (named re-exports) ---
  const namedReExportPattern = /export\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let namedReExportMatch;
  while ((namedReExportMatch = namedReExportPattern.exec(cleaned)) !== null) {
    const names = namedReExportMatch[1];
    const importPath = namedReExportMatch[2];
    const resolved = resolveImportPath(filePath, importPath);

    if (resolved) {
      // Get all exports from the source file
      const sourceExports = extractExportsFromFile(resolved, pkgDir, visited);
      // Filter to only the named ones
      const requestedNames = names
        .split(",")
        .map((n) => {
          const parts = n.trim().split(/\s+as\s+/);
          return { original: parts[0].replace(/^type\s+/, "").trim(), alias: (parts[1] || parts[0]).trim() };
        });

      for (const { original, alias } of requestedNames) {
        const found = sourceExports.find((s) => s.name === original);
        if (found) {
          symbols.push({
            ...found,
            name: alias,
          });
        } else {
          // Symbol might be a type re-export not found via simple parsing
          symbols.push({
            name: alias,
            kind: "type",
            signature: `export { ${original}${alias !== original ? ` as ${alias}` : ""} }`,
            sourceFile: relativeFile,
          });
        }
      }
    }
  }

  // --- Handle `export type { name } from "./..."` ---
  const typeReExportPattern = /export\s+type\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
  let typeReExportMatch;
  while ((typeReExportMatch = typeReExportPattern.exec(cleaned)) !== null) {
    const names = typeReExportMatch[1];
    const importPath = typeReExportMatch[2];
    const resolved = resolveImportPath(filePath, importPath);

    if (resolved) {
      const sourceExports = extractExportsFromFile(resolved, pkgDir, visited);
      const requestedNames = names
        .split(",")
        .map((n) => {
          const parts = n.trim().split(/\s+as\s+/);
          return { original: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
        });

      for (const { original, alias } of requestedNames) {
        const found = sourceExports.find((s) => s.name === original);
        if (found) {
          symbols.push({ ...found, name: alias });
        } else {
          symbols.push({
            name: alias,
            kind: "type",
            signature: `export type { ${original}${alias !== original ? ` as ${alias}` : ""} }`,
            sourceFile: relativeFile,
          });
        }
      }
    }
  }

  // --- Handle direct exports ---

  // export function name(...): ReturnType
  const funcPattern = /export\s+(async\s+)?function\s+(\w+)/g;
  let funcMatch;
  while ((funcMatch = funcPattern.exec(cleaned)) !== null) {
    const name = funcMatch[2];
    const sig = extractFunctionSignature(cleaned, funcMatch.index);
    symbols.push({
      name,
      kind: "function",
      signature: sig,
      sourceFile: relativeFile,
    });
  }

  // export class Name
  const classPattern = /export\s+class\s+(\w+)/g;
  let classMatch;
  while ((classMatch = classPattern.exec(cleaned)) !== null) {
    const name = classMatch[1];
    const sig = extractDeclSignature(cleaned, classMatch.index);
    symbols.push({
      name,
      kind: "class",
      signature: sig,
      sourceFile: relativeFile,
    });
  }

  // export interface Name
  const ifacePattern = /export\s+interface\s+(\w+)/g;
  let ifaceMatch;
  while ((ifaceMatch = ifacePattern.exec(cleaned)) !== null) {
    const name = ifaceMatch[1];
    const sig = extractDeclSignature(cleaned, ifaceMatch.index);
    symbols.push({
      name,
      kind: "interface",
      signature: sig,
      sourceFile: relativeFile,
    });
  }

  // export type Name = ...
  const typePattern = /export\s+type\s+(\w+)\s*(?:<[^>]*>)?\s*=/g;
  let typeMatch;
  while ((typeMatch = typePattern.exec(cleaned)) !== null) {
    const name = typeMatch[1];
    const sig = extractTypeSignature(cleaned, typeMatch.index);
    symbols.push({
      name,
      kind: "type",
      signature: sig,
      sourceFile: relativeFile,
    });
  }

  // export const/let/var Name
  const varPattern = /export\s+(const|let|var)\s+(\w+)/g;
  let varMatch;
  while ((varMatch = varPattern.exec(cleaned)) !== null) {
    const kind = varMatch[1] as "const" | "let";
    const name = varMatch[2];
    // Extract just the declaration part (type annotation)
    const afterDecl = cleaned.slice(varMatch.index);
    const colonMatch = afterDecl.match(/(?:const|let|var)\s+\w+\s*:\s*([^=]+?)(?:\s*=|$)/);
    const typeAnnotation = colonMatch ? colonMatch[1].trim() : "";

    symbols.push({
      name,
      kind: kind === "var" ? "variable" : kind,
      signature: typeAnnotation
        ? `export ${kind} ${name}: ${typeAnnotation}`
        : `export ${kind} ${name}`,
      sourceFile: relativeFile,
    });
  }

  // export enum Name
  const enumPattern = /export\s+enum\s+(\w+)/g;
  let enumMatch;
  while ((enumMatch = enumPattern.exec(cleaned)) !== null) {
    const name = enumMatch[1];
    const sig = extractDeclSignature(cleaned, enumMatch.index);
    symbols.push({
      name,
      kind: "enum",
      signature: sig,
      sourceFile: relativeFile,
    });
  }

  return symbols;
}

// ---- Report Generation ----

function generateReport(pkg: PackageConfig, symbols: ExportedSymbol[]): string {
  // Deduplicate by name (keep first occurrence)
  const seen = new Set<string>();
  const unique = symbols.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });

  // Sort by kind then name for deterministic output
  const kindOrder: Record<string, number> = {
    enum: 0,
    interface: 1,
    type: 2,
    class: 3,
    function: 4,
    const: 5,
    let: 6,
    variable: 7,
  };

  unique.sort((a, b) => {
    const kindDiff = (kindOrder[a.kind] ?? 99) - (kindOrder[b.kind] ?? 99);
    if (kindDiff !== 0) return kindDiff;
    return a.name.localeCompare(b.name);
  });

  const lines: string[] = [];
  lines.push(`## API Report File for "${pkg.name}"`);
  lines.push("");
  lines.push("> Do not edit this file. It is a report generated by [api-surface](../scripts/api-surface.ts).");
  lines.push(">");
  lines.push(`> Package: \`${pkg.name}\``);
  lines.push(`> Entry point: \`${pkg.entry}\``);
  lines.push("");
  lines.push("```ts");
  lines.push("");

  let lastKind = "";
  for (const sym of unique) {
    if (sym.kind !== lastKind) {
      if (lastKind !== "") lines.push("");
      const plural = sym.kind.endsWith("s") ? sym.kind + "es" : sym.kind + "s";
      lines.push(`// --- ${plural} ---`);
      lines.push("");
      lastKind = sym.kind;
    }
    lines.push(`// (from ${sym.sourceFile})`);
    lines.push(`${sym.signature};`);
    lines.push("");
  }

  lines.push("```");
  lines.push("");

  // Summary
  const counts: Record<string, number> = {};
  for (const sym of unique) {
    counts[sym.kind] = (counts[sym.kind] || 0) + 1;
  }
  lines.push("### Summary");
  lines.push("");
  lines.push(`| Kind | Count |`);
  lines.push(`|------|-------|`);
  for (const [kind, count] of Object.entries(counts).sort()) {
    lines.push(`| ${kind} | ${count} |`);
  }
  lines.push(`| **Total** | **${unique.length}** |`);
  lines.push("");

  return lines.join("\n");
}

// ---- Main ----

function main(): void {
  const args = process.argv.slice(2);
  const checkMode = args.includes("--check");

  if (checkMode) {
    console.log("Checking API surface reports are up to date...\n");
  } else {
    console.log("Generating API surface reports...\n");
  }

  fs.mkdirSync(ETC_DIR, { recursive: true });

  let hasChanges = false;
  let hasErrors = false;

  for (const pkg of TRACKED_PACKAGES) {
    const pkgDir = path.join(ROOT, pkg.dir);
    const entryPoint = path.join(pkgDir, pkg.entry);

    if (!fs.existsSync(entryPoint)) {
      console.error(`  ERROR: Entry point not found: ${entryPoint}`);
      hasErrors = true;
      continue;
    }

    console.log(`  Processing ${pkg.name}...`);
    const symbols = extractExportsFromFile(entryPoint, pkgDir);
    const report = generateReport(pkg, symbols);
    const reportPath = path.join(ETC_DIR, pkg.reportFile);

    if (checkMode) {
      const existing = readFileSafe(reportPath);
      if (!existing) {
        console.error(`    MISSING: ${pkg.reportFile} does not exist. Run 'pnpm api-report' to generate it.`);
        hasChanges = true;
      } else if (existing !== report) {
        console.error(`    CHANGED: ${pkg.reportFile} is out of date. Run 'pnpm api-report' to update it.`);

        // Show a simple diff summary
        const existingLines = existing.split("\n");
        const newLines = report.split("\n");
        const added = newLines.filter((l) => !existingLines.includes(l) && l.trim() && !l.startsWith("//"));
        const removed = existingLines.filter((l) => !newLines.includes(l) && l.trim() && !l.startsWith("//"));

        if (removed.length > 0) {
          console.error("      Removed:");
          for (const l of removed.slice(0, 10)) {
            console.error(`        - ${l.trim()}`);
          }
        }
        if (added.length > 0) {
          console.error("      Added:");
          for (const l of added.slice(0, 10)) {
            console.error(`        + ${l.trim()}`);
          }
        }
        hasChanges = true;
      } else {
        console.log(`    OK: ${pkg.reportFile} is up to date.`);
      }
    } else {
      fs.writeFileSync(reportPath, report, "utf-8");
      console.log(`    Written: ${pkg.reportFile} (${symbols.length} exports)`);
    }
  }

  console.log("");

  if (checkMode && hasChanges) {
    console.error("API surface reports are out of date. Run 'pnpm api-report' and commit the changes.");
    process.exit(1);
  }

  if (hasErrors) {
    console.error("Some packages could not be processed.");
    process.exit(1);
  }

  if (checkMode) {
    console.log("All API surface reports are up to date.");
  } else {
    console.log("API surface reports generated successfully.");
    console.log(`Reports written to: ${path.relative(ROOT, ETC_DIR)}/`);
  }
}

main();
