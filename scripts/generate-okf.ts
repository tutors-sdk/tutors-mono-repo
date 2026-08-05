/**
 * Tutors OKF v0.2 Knowledge Bundle Generator
 *
 * Introspects the Tutors monorepo and generates an Open Knowledge Format bundle
 * cataloging packages, types, components, routes, services, and schemas
 * for LLM/agent consumption.
 *
 * Usage: pnpm generate:okf
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const OKF_OUTPUT = path.join(ROOT, "okf");

// --- Helpers ---

function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function titleCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function escapeYaml(s: string): string {
  if (/[:#\[\]{}|>&*!?,]/.test(s) || s.includes("'") || s.includes('"')) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function writeOkf(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function generateTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function readJsonSafe(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function findFiles(dir: string, pattern: RegExp, maxDepth = 5): string[] {
  const results: string[] = [];
  function walk(d: string, depth: number) {
    if (depth > maxDepth || !fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".svelte-kit" || entry.name === "dist" || entry.name === "build") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (pattern.test(entry.name)) {
        results.push(full);
      }
    }
  }
  walk(dir, 0);
  return results;
}

// --- Data Extraction ---

interface PackageInfo {
  name: string;
  version: string;
  description: string;
  slug: string;
  dir: string;
  category: "jsr" | "svelte" | "app" | "service";
  dependencies: string[];
  exports: string[];
  scripts: Record<string, string>;
}

interface RouteInfo {
  path: string;
  app: string;
  hasLoad: boolean;
  hasServerLoad: boolean;
  params: string[];
  isSSR: boolean;
}

interface ComponentInfo {
  name: string;
  file: string;
  package: string;
  props: Array<{ name: string; type: string; required: boolean }>;
  hasSnippets: boolean;
}

interface TypeInfo {
  name: string;
  kind: "interface" | "type" | "class" | "enum";
  file: string;
  fields: Array<{ name: string; type: string; optional: boolean }>;
  exported: boolean;
}

interface SchemaInfo {
  name: string;
  description: string;
  fields: Array<{ name: string; type: string; required: boolean }>;
}

interface ServiceInfo {
  name: string;
  file: string;
  package: string;
  methods: string[];
}

function extractPackages(): PackageInfo[] {
  const packages: PackageInfo[] = [];

  const dirs = [
    { dir: "packages/jsr/model", category: "jsr" as const },
    { dir: "packages/jsr/gen", category: "jsr" as const },
    { dir: "packages/jsr/time", category: "jsr" as const },
    { dir: "packages/jsr/tutors", category: "jsr" as const },
    { dir: "packages/svelte/course", category: "svelte" as const },
    { dir: "packages/svelte/runes", category: "svelte" as const },
    { dir: "packages/svelte/community", category: "svelte" as const },
    { dir: "packages/svelte/connect", category: "svelte" as const },
    { dir: "packages/svelte/themes", category: "svelte" as const },
    { dir: "packages/svelte/ui-primitives", category: "svelte" as const },
    { dir: "packages/svelte/ui-components", category: "svelte" as const },
    { dir: "packages/svelte/utils/logger", category: "svelte" as const },
    { dir: "packages/svelte/utils/a11y", category: "svelte" as const },
    { dir: "packages/svelte/utils/i18n", category: "svelte" as const },
    { dir: "apps/reader", category: "app" as const },
    { dir: "apps/catalogue", category: "app" as const },
    { dir: "apps/live", category: "app" as const },
    { dir: "services/party", category: "service" as const },
  ];

  for (const { dir, category } of dirs) {
    const pkgPath = path.join(ROOT, dir, "package.json");
    const pkg = readJsonSafe(pkgPath);
    if (!pkg) continue;

    const deps = Object.keys(pkg.dependencies || {}).filter((d) => d.startsWith("@tutors/"));
    const exportKeys = Object.keys(pkg.exports || {});

    packages.push({
      name: pkg.name || dir,
      version: pkg.version || "0.0.0",
      description: pkg.description || "",
      slug: kebab(pkg.name?.replace("@tutors/", "") || path.basename(dir)),
      dir,
      category,
      dependencies: deps,
      exports: exportKeys,
      scripts: pkg.scripts || {},
    });
  }

  return packages;
}

function extractRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const apps = ["reader", "catalogue", "live"];

  for (const app of apps) {
    const routesDir = path.join(ROOT, "apps", app, "src", "routes");
    if (!fs.existsSync(routesDir)) continue;

    const pageFiles = findFiles(routesDir, /\+page\.(ts|svelte)$/);
    const layoutFiles = findFiles(routesDir, /\+layout\.(ts|svelte|server\.ts)$/);
    const allRouteFiles = [...pageFiles, ...layoutFiles];

    const seen = new Set<string>();
    for (const file of allRouteFiles) {
      const rel = path.relative(routesDir, path.dirname(file));
      const routePath = "/" + rel.replace(/\\/g, "/").replace(/\(.*?\)\/?/g, "");
      if (seen.has(routePath)) continue;
      seen.add(routePath);

      const dirContents = fs.readdirSync(path.dirname(file));
      const hasLoad = dirContents.some((f) => f === "+page.ts" || f === "+page.js");
      const hasServerLoad = dirContents.some((f) => f === "+page.server.ts" || f === "+layout.server.ts");

      const params = (routePath.match(/\[(\w+)\]/g) || []).map((p) => p.slice(1, -1));

      const pageTs = path.join(path.dirname(file), "+page.ts");
      let isSSR = true;
      if (fs.existsSync(pageTs)) {
        const content = readFileSafe(pageTs);
        if (content.includes("export const ssr = false")) isSSR = false;
      }

      routes.push({ path: routePath || "/", app, hasLoad, hasServerLoad, params, isSSR });
    }
  }

  return routes;
}

function extractComponents(): ComponentInfo[] {
  const components: ComponentInfo[] = [];
  const componentDirs = [
    { dir: "packages/svelte/ui-primitives/src", pkg: "ui-primitives" },
    { dir: "packages/svelte/ui-components/src", pkg: "ui-components" },
  ];

  for (const { dir, pkg } of componentDirs) {
    const fullDir = path.join(ROOT, dir);
    const svelteFiles = findFiles(fullDir, /\.svelte$/);

    for (const file of svelteFiles) {
      const content = readFileSafe(file);
      const name = path.basename(file, ".svelte");

      // Extract props from interface Props
      const props: ComponentInfo["props"] = [];
      const propsMatch = content.match(/interface Props \{([^}]*)\}/s);
      if (propsMatch) {
        const propsBody = propsMatch[1];
        const propLines = propsBody.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
        for (const line of propLines) {
          const match = line.match(/(\w+)(\?)?:\s*(.+?);?\s*$/);
          if (match) {
            props.push({
              name: match[1],
              type: match[3].replace(/;$/, "").trim(),
              required: !match[2],
            });
          }
        }
      }

      const hasSnippets = content.includes("Snippet");

      components.push({
        name,
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        package: pkg,
        props,
        hasSnippets,
      });
    }
  }

  return components;
}

function extractTypes(): TypeInfo[] {
  const seen = new Map<string, TypeInfo>();

  // Scan ALL packages for TypeScript files, excluding test and build artifacts
  const tsFiles = findFiles(path.join(ROOT, "packages"), /\.(?:svelte\.)?ts$/).filter((f) => {
    const n = f.replace(/\\/g, "/");
    return !n.includes("/__tests__/") && !n.includes("/test/") && !n.includes(".test.") && !n.includes(".spec.");
  });

  for (const file of tsFiles) {
    const content = readFileSafe(file);
    if (!content) continue;

    // Find all exported type declarations: interface, type, class, enum
    const exportPattern = /export\s+(interface|type|class|enum)\s+(\w+)/g;
    let match;
    while ((match = exportPattern.exec(content)) !== null) {
      const kind = match[1] as TypeInfo["kind"];
      const name = match[2];
      const startIdx = match.index + match[0].length;
      const lookAhead = content.slice(startIdx, Math.min(startIdx + 500, content.length));
      const bracePos = lookAhead.indexOf("{");
      const semiPos = lookAhead.indexOf(";");

      // Simple type alias: export type Foo = Bar | Baz;
      if (kind === "type" && semiPos !== -1 && (bracePos === -1 || semiPos < bracePos)) {
        const aliasMatch = lookAhead.slice(0, semiPos).match(/=\s*(.+)/s);
        if (aliasMatch) {
          const aliasValue = aliasMatch[1].trim();
          const typeInfo: TypeInfo = {
            name,
            kind: "type",
            file: path.relative(ROOT, file).replace(/\\/g, "/"),
            fields: [{ name: "(alias)", type: aliasValue, optional: false }],
            exported: true,
          };
          const existing = seen.get(name);
          if (!existing || typeInfo.fields.length > existing.fields.length) {
            seen.set(name, typeInfo);
          }
        }
        continue;
      }

      if (bracePos === -1) continue;

      // Use brace counting to extract the full body (handles nested braces)
      const bodyStart = startIdx + bracePos;
      let depth = 0;
      let bodyEnd = -1;
      for (let i = bodyStart; i < content.length; i++) {
        if (content[i] === "{") depth++;
        else if (content[i] === "}") {
          depth--;
          if (depth === 0) {
            bodyEnd = i;
            break;
          }
        }
      }
      if (bodyEnd === -1) continue;

      const body = content.slice(bodyStart + 1, bodyEnd);
      const fields: TypeInfo["fields"] = [];

      // Track nesting depth to skip fields inside nested objects
      let bodyDepth = 0;
      for (const line of body.split("\n")) {
        const trimmed = line.trim();
        const lineDepth = bodyDepth;

        // Update depth for next line
        for (const ch of trimmed) {
          if (ch === "{") bodyDepth++;
          else if (ch === "}") bodyDepth--;
        }

        // Only extract fields at the top level
        if (lineDepth > 0) continue;

        if (
          !trimmed ||
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/**") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("[") ||
          trimmed.startsWith("}") ||
          trimmed.startsWith("constructor")
        )
          continue;
        // Skip method signatures (name followed by parenthesis)
        if (/^\w+\s*[\(<]/.test(trimmed)) continue;

        const fieldMatch = trimmed.match(/^(?:readonly\s+)?(\w+)(\?)?:\s*(.+?)\s*;?\s*$/);
        if (fieldMatch) {
          let fieldType = fieldMatch[3]
            .replace(/\/\/.*$/, "")
            .replace(/\s*=\s*\$state.*$/, "")
            .replace(/;\s*$/, "")
            .trim();
          if (fieldType) {
            fields.push({
              name: fieldMatch[1],
              type: fieldType.startsWith("{") ? "object" : fieldType,
              optional: !!fieldMatch[2],
            });
          }
        }
      }

      const typeInfo: TypeInfo = {
        name,
        kind,
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        fields,
        exported: true,
      };

      // Deduplicate by name: keep the entry with more fields
      const existing = seen.get(name);
      if (!existing || typeInfo.fields.length > existing.fields.length) {
        seen.set(name, typeInfo);
      }
    }
  }

  return Array.from(seen.values());
}

function extractSchemas(): SchemaInfo[] {
  const schemas: SchemaInfo[] = [];
  const seen = new Set<string>();

  // Collect all TypeScript files to scan for schemas
  const allTsFiles = [
    path.join(ROOT, "tests/contract/support/schemas.ts"),
    ...findFiles(path.join(ROOT, "packages"), /\.(?:svelte\.)?ts$/).filter((f) => {
      const n = f.replace(/\\/g, "/");
      return !n.includes("/__tests__/") && !n.includes("/test/") && !n.includes(".test.") && !n.includes(".spec.");
    }),
  ];

  for (const file of allTsFiles) {
    const content = readFileSafe(file);
    if (!content) continue;

    // 1. Extract Zod schemas (z.object definitions)
    if (content.includes("z.object(")) {
      const schemaRegex = /export const (\w+)\s*=\s*z\.object\(\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\)/g;
      let zodMatch;
      while ((zodMatch = schemaRegex.exec(content)) !== null) {
        const name = zodMatch[1];
        if (seen.has(name)) continue;
        seen.add(name);
        const body = zodMatch[2];
        const fields: SchemaInfo["fields"] = [];
        for (const line of body.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"))) {
          const fieldMatch = line.match(/(\w+):\s*z\.(\w+)\(\)(.*)$/);
          if (fieldMatch) {
            fields.push({
              name: fieldMatch[1],
              type: fieldMatch[2],
              required: !fieldMatch[3].includes(".optional()") && !fieldMatch[3].includes(".nullable()"),
            });
          }
        }
        schemas.push({
          name,
          description: titleCase(name.replace(/Schema$/, "").replace(/([A-Z])/g, " $1").trim()),
          fields,
        });
      }
    }

    // 2. Extract Supabase table models and data-record types as schema concepts
    const schemaExportPattern = /export\s+(?:interface|type)\s+(\w+)/g;
    let exportMatch;
    while ((exportMatch = schemaExportPattern.exec(content)) !== null) {
      const name = exportMatch[1];
      if (seen.has(name)) continue;

      // Extract the direct comment above this declaration (not a broad window)
      const beforeExport = content.slice(Math.max(0, exportMatch.index - 200), exportMatch.index);
      const lastCommentMatch = beforeExport.match(/(?:\/\*\*(?:[^*]|\*(?!\/))*\*\/|\/\/[^\n]*)\s*$/);
      const directComment = lastCommentMatch ? lastCommentMatch[0].toLowerCase() : "";
      const isDbComment = /supabase|table model|\brow\b|pivoted|prepared|\bdb\b/.test(directComment);
      // Check name pattern for database model types (exclude Service/Model suffixes)
      const isDbName = /(?:Row|Table|Entry)$/.test(name) || (/^TutorsConnect/.test(name) && !/Service$/.test(name));

      if (!isDbComment && !isDbName) continue;
      seen.add(name);

      // Find body using brace counting
      const startIdx = exportMatch.index + exportMatch[0].length;
      const lookAhead = content.slice(startIdx, Math.min(startIdx + 500, content.length));
      const bracePos = lookAhead.indexOf("{");
      const semiPos = lookAhead.indexOf(";");

      // Skip simple type aliases (no body)
      if (semiPos !== -1 && (bracePos === -1 || semiPos < bracePos)) continue;
      if (bracePos === -1) continue;

      const bodyStart = startIdx + bracePos;
      let depth = 0;
      let bodyEnd = -1;
      for (let i = bodyStart; i < content.length; i++) {
        if (content[i] === "{") depth++;
        else if (content[i] === "}") {
          depth--;
          if (depth === 0) { bodyEnd = i; break; }
        }
      }
      if (bodyEnd === -1) continue;

      const body = content.slice(bodyStart + 1, bodyEnd);
      const fields: SchemaInfo["fields"] = [];
      let bodyDepth = 0;

      for (const line of body.split("\n")) {
        const trimmed = line.trim();
        const lineDepth = bodyDepth;
        for (const ch of trimmed) {
          if (ch === "{") bodyDepth++;
          else if (ch === "}") bodyDepth--;
        }
        // Only extract top-level flat fields for schemas
        if (lineDepth > 0) continue;
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/**") ||
            trimmed.startsWith("/*") || trimmed.startsWith("[") || trimmed.startsWith("}")) continue;
        if (/^\w+\s*[\(<]/.test(trimmed)) continue;

        const fieldMatch = trimmed.match(/^(?:readonly\s+)?(\w+)(\?)?:\s*(.+?)\s*;?\s*$/);
        if (fieldMatch) {
          const fieldType = fieldMatch[3].replace(/\/\/.*$/, "").replace(/;\s*$/, "").trim();
          // Skip nested object fields for clean schema output
          if (fieldType && !fieldType.startsWith("{")) {
            fields.push({
              name: fieldMatch[1],
              type: fieldType,
              required: !fieldMatch[2],
            });
          }
        }
      }

      if (fields.length > 0) {
        const desc = name.replace(/([A-Z])/g, " $1").trim();
        schemas.push({
          name,
          description: titleCase(desc),
          fields,
        });
      }
    }
  }

  return schemas;
}

function extractServices(): ServiceInfo[] {
  const services: ServiceInfo[] = [];
  const serviceDirs = [
    { dir: "packages/svelte/community/src/services", pkg: "community" },
    { dir: "packages/svelte/connect/src/services", pkg: "connect" },
    { dir: "packages/svelte/course/src/course/services", pkg: "course" },
  ];

  for (const { dir, pkg } of serviceDirs) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = findFiles(fullDir, /\.(?:svelte\.)?ts$/);
    for (const file of files) {
      const content = readFileSafe(file);
      const baseName = path.basename(file, ".ts").replace(".svelte", "");

      // Extract exported service methods
      const methods: string[] = [];

      // Match method definitions in object literals or class methods
      const methodRegex = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g;
      let methodMatch;
      while ((methodMatch = methodRegex.exec(content)) !== null) {
        const methodName = methodMatch[1];
        if (methodName !== "constructor" && methodName !== "if" && methodName !== "for" && methodName !== "while") {
          methods.push(methodName);
        }
      }

      if (methods.length > 0) {
        services.push({
          name: baseName,
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          package: pkg,
          methods: [...new Set(methods)],
        });
      }
    }
  }

  return services;
}

// --- OKF Markdown Generation ---

function generateBundleIndex(packages: PackageInfo[], routeCount: number, componentCount: number, typeCount: number, schemaCount: number, serviceCount: number): string {
  const appCount = packages.filter((p) => p.category === "app").length;
  const pkgCount = packages.filter((p) => p.category !== "app" && p.category !== "service").length;
  return [
    "---",
    'okf_version: "0.2"',
    "---",
    "",
    "# Tutors Learning Platform Knowledge Bundle",
    "",
    `This bundle catalogs the Tutors monorepo: **${appCount} apps**, **${pkgCount} packages**, **${componentCount} components**, **${typeCount} types**, **${schemaCount} data schemas**, **${serviceCount} services**, and **${routeCount} routes**.`,
    "",
    "Tutors is an open-source learning platform built with SvelteKit, Svelte 5, Skeleton UI, Supabase, and PartyKit.",
    "",
    "## Sections",
    "",
    "* [Packages](packages/index.md) — Workspace packages and apps",
    "* [Components](components/index.md) — Svelte UI components with props",
    "* [Routes](routes/index.md) — SvelteKit route structure per app",
    "* [Types](types/index.md) — Core type definitions from tutors-model-lib",
    "* [Schemas](schemas/index.md) — Supabase and API data schemas",
    "* [Services](services/index.md) — Application services and their methods",
    "",
  ].join("\n");
}

function generateLog(counts: Record<string, number>): string {
  const date = new Date().toISOString().split("T")[0];
  return [
    "# Bundle Update Log",
    "",
    `## ${date}`,
    "",
    `* **Generation**: Generated OKF bundle from Tutors monorepo source`,
    ...Object.entries(counts).map(([k, v]) => `* **${titleCase(k)}**: ${v} concepts`),
    `* **Generator**: \`scripts/generate-okf.ts\``,
    "",
  ].join("\n");
}

function generatePackagesConcepts(packages: PackageInfo[], timestamp: string): void {
  // Packages index
  const byCategory = new Map<string, PackageInfo[]>();
  for (const pkg of packages) {
    const group = byCategory.get(pkg.category) || [];
    group.push(pkg);
    byCategory.set(pkg.category, group);
  }

  const indexLines = ["# Packages", "", "Workspace packages and applications in the Tutors monorepo.", ""];
  const categoryLabels: Record<string, string> = { jsr: "JSR Packages (Deno-compatible)", svelte: "Svelte Packages", app: "Applications", service: "Services" };

  for (const [cat, label] of Object.entries(categoryLabels)) {
    const group = byCategory.get(cat);
    if (!group) continue;
    indexLines.push(`## ${label}`, "");
    for (const pkg of group.sort((a, b) => a.name.localeCompare(b.name))) {
      indexLines.push(`* [${pkg.name}](${pkg.slug}.md) — ${pkg.description || pkg.dir}`);
    }
    indexLines.push("");
  }
  writeOkf(path.join(OKF_OUTPUT, "packages", "index.md"), indexLines.join("\n"));

  // Individual package concepts
  for (const pkg of packages) {
    const tags = [pkg.category];
    if (pkg.category === "jsr") tags.push("deno");
    if (pkg.category === "svelte") tags.push("svelte");

    const lines = [
      "---",
      "type: Tutors Package",
      `title: ${escapeYaml(pkg.name)}`,
      `description: ${escapeYaml(pkg.description || `${pkg.name} package`)}`,
      `tags: [${tags.join(", ")}]`,
      "generated:",
      "  by: process:generate-okf",
      `  at: ${timestamp}`,
      "status: stable",
      "---",
      "",
      "# Package Details",
      "",
      "| Property | Value |",
      "|----------|-------|",
      `| Name | ${pkg.name} |`,
      `| Version | ${pkg.version} |`,
      `| Directory | \`${pkg.dir}\` |`,
      `| Category | ${pkg.category} |`,
    ];

    if (pkg.exports.length > 0) {
      lines.push("", "# Exports", "");
      for (const exp of pkg.exports) {
        lines.push(`- \`${exp}\``);
      }
    }

    if (pkg.dependencies.length > 0) {
      lines.push("", "# Internal Dependencies", "");
      for (const dep of pkg.dependencies) {
        const depPkg = packages.find((p) => p.name === dep);
        if (depPkg) {
          lines.push(`- [${dep}](${depPkg.slug}.md)`);
        } else {
          lines.push(`- ${dep}`);
        }
      }
    }

    if (Object.keys(pkg.scripts).length > 0) {
      lines.push("", "# Scripts", "");
      for (const [name, cmd] of Object.entries(pkg.scripts)) {
        lines.push(`- \`${name}\`: \`${cmd}\``);
      }
    }

    lines.push("");
    writeOkf(path.join(OKF_OUTPUT, "packages", `${pkg.slug}.md`), lines.join("\n"));
  }
}

function generateComponentConcepts(components: ComponentInfo[], timestamp: string): void {
  const byPackage = new Map<string, ComponentInfo[]>();
  for (const comp of components) {
    const group = byPackage.get(comp.package) || [];
    group.push(comp);
    byPackage.set(comp.package, group);
  }

  const indexLines = ["# UI Components", "", "Svelte 5 components in the Tutors platform.", ""];
  for (const [pkg, comps] of Array.from(byPackage.entries()).sort()) {
    indexLines.push(`## ${titleCase(pkg)}`, "");
    for (const comp of comps.sort((a, b) => a.name.localeCompare(b.name))) {
      const propCount = comp.props.length;
      indexLines.push(`* [${comp.name}](${kebab(comp.name)}.md) — ${propCount} props`);
    }
    indexLines.push("");
  }
  writeOkf(path.join(OKF_OUTPUT, "components", "index.md"), indexLines.join("\n"));

  for (const comp of components) {
    const lines = [
      "---",
      "type: Tutors Component",
      `title: ${comp.name}`,
      `description: Svelte 5 component from @tutors/${comp.package}`,
      `tags: [svelte, ${comp.package}]`,
      "generated:",
      "  by: process:generate-okf",
      `  at: ${timestamp}`,
      "status: stable",
      "---",
      "",
      `# ${comp.name}`,
      "",
      `**File**: \`${comp.file}\``,
      `**Package**: \`@tutors/${comp.package}\``,
    ];

    if (comp.props.length > 0) {
      lines.push("", "# Props", "", "| Name | Type | Required |", "|------|------|----------|");
      for (const prop of comp.props) {
        lines.push(`| ${prop.name} | \`${prop.type}\` | ${prop.required ? "yes" : "no"} |`);
      }
    }

    if (comp.hasSnippets) {
      lines.push("", "*This component accepts Snippet children (Svelte 5 slot replacement).*");
    }

    lines.push("");
    writeOkf(path.join(OKF_OUTPUT, "components", `${kebab(comp.name)}.md`), lines.join("\n"));
  }
}

function generateRouteConcepts(routes: RouteInfo[], timestamp: string): void {
  const byApp = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    const group = byApp.get(route.app) || [];
    group.push(route);
    byApp.set(route.app, group);
  }

  const indexLines = ["# Routes", "", "SvelteKit routes across all Tutors applications.", ""];
  for (const [app, appRoutes] of Array.from(byApp.entries()).sort()) {
    indexLines.push(`## ${titleCase(app)} App`, "");
    for (const route of appRoutes.sort((a, b) => a.path.localeCompare(b.path))) {
      const badges: string[] = [];
      if (route.hasLoad) badges.push("load");
      if (route.hasServerLoad) badges.push("server");
      if (route.params.length > 0) badges.push(`params: ${route.params.join(", ")}`);
      if (!route.isSSR) badges.push("CSR only");
      const badgeStr = badges.length > 0 ? ` (${badges.join(", ")})` : "";
      indexLines.push(`* \`${route.path}\`${badgeStr}`);
    }
    indexLines.push("");
  }
  writeOkf(path.join(OKF_OUTPUT, "routes", "index.md"), indexLines.join("\n"));

  for (const route of routes) {
    const slug = route.path === "/" ? `${route.app}-root` : `${route.app}-${route.path.replace(/\//g, "-").replace(/[\[\]]/g, "").replace(/^-/, "")}`;
    const lines = [
      "---",
      "type: Tutors Route",
      `title: ${escapeYaml(route.path)}`,
      `description: ${titleCase(route.app)} app route`,
      `tags: [${route.app}, route]`,
      "generated:",
      "  by: process:generate-okf",
      `  at: ${timestamp}`,
      "status: stable",
      "---",
      "",
      "# Route Details",
      "",
      "| Property | Value |",
      "|----------|-------|",
      `| Path | \`${route.path}\` |`,
      `| App | ${route.app} |`,
      `| Has Load | ${route.hasLoad ? "yes" : "no"} |`,
      `| Has Server Load | ${route.hasServerLoad ? "yes" : "no"} |`,
      `| SSR | ${route.isSSR ? "yes" : "no"} |`,
    ];

    if (route.params.length > 0) {
      lines.push("", "# Parameters", "");
      for (const param of route.params) {
        lines.push(`- \`${param}\``);
      }
    }

    lines.push("");
    writeOkf(path.join(OKF_OUTPUT, "routes", `${slug}.md`), lines.join("\n"));
  }
}

function generateTypeConcepts(types: TypeInfo[], timestamp: string): void {
  const indexLines = ["# Core Types", "", "Type definitions from all Tutors monorepo packages.", ""];
  for (const t of types.sort((a, b) => a.name.localeCompare(b.name))) {
    const isAlias = t.fields.length === 1 && t.fields[0].name === "(alias)";
    const detail = isAlias ? `alias for \`${t.fields[0].type}\`` : `${t.kind} (${t.fields.length} fields)`;
    indexLines.push(`* [${t.name}](${kebab(t.name)}.md) — ${detail}`);
  }
  indexLines.push("");
  writeOkf(path.join(OKF_OUTPUT, "types", "index.md"), indexLines.join("\n"));

  for (const t of types) {
    const pkg = t.file.split("/").slice(0, 3).join("/");
    const isAlias = t.fields.length === 1 && t.fields[0].name === "(alias)";

    const lines = [
      "---",
      "type: Tutors Type",
      `title: ${t.name}`,
      `description: ${t.kind} from ${pkg}`,
      `tags: [${t.kind}, ${pkg.includes("jsr") ? "jsr" : "svelte"}]`,
      "generated:",
      "  by: process:generate-okf",
      `  at: ${timestamp}`,
      "status: stable",
      "---",
      "",
      `# ${t.name}`,
      "",
      `**Kind**: ${t.kind}`,
      `**File**: \`${t.file}\``,
    ];

    if (isAlias) {
      lines.push("", `**Alias for**: \`${t.fields[0].type}\``);
    } else if (t.fields.length > 0) {
      lines.push("", "# Fields", "", "| Name | Type | Optional |", "|------|------|----------|");
      for (const field of t.fields) {
        lines.push(`| ${field.name} | \`${field.type}\` | ${field.optional ? "yes" : "no"} |`);
      }
    }

    lines.push("");
    writeOkf(path.join(OKF_OUTPUT, "types", `${kebab(t.name)}.md`), lines.join("\n"));
  }
}

function generateSchemaConcepts(schemas: SchemaInfo[], timestamp: string): void {
  const indexLines = ["# Data Schemas", "", "Data schemas from Supabase table models and structured data types.", ""];
  for (const s of schemas.sort((a, b) => a.name.localeCompare(b.name))) {
    indexLines.push(`* [${s.description}](${kebab(s.name)}.md) — ${s.fields.length} fields`);
  }
  indexLines.push("");
  writeOkf(path.join(OKF_OUTPUT, "schemas", "index.md"), indexLines.join("\n"));

  for (const s of schemas) {
    const lines = [
      "---",
      "type: Tutors Schema",
      `title: ${escapeYaml(s.description)}`,
      `description: ${escapeYaml(`Data schema: ${s.description}`)}`,
      "tags: [schema, data-model]",
      "generated:",
      "  by: process:generate-okf",
      `  at: ${timestamp}`,
      "status: stable",
      "---",
      "",
      `# ${s.description}`,
      "",
      `**Schema name**: \`${s.name}\``,
      "",
      "# Fields",
      "",
      "| Name | Type | Required |",
      "|------|------|----------|",
    ];

    for (const f of s.fields) {
      lines.push(`| ${f.name} | ${f.type} | ${f.required ? "yes" : "no"} |`);
    }

    lines.push("");
    writeOkf(path.join(OKF_OUTPUT, "schemas", `${kebab(s.name)}.md`), lines.join("\n"));
  }
}

function generateServiceConcepts(services: ServiceInfo[], timestamp: string): void {
  const byPackage = new Map<string, ServiceInfo[]>();
  for (const svc of services) {
    const group = byPackage.get(svc.package) || [];
    group.push(svc);
    byPackage.set(svc.package, group);
  }

  const indexLines = ["# Services", "", "Application services providing business logic.", ""];
  for (const [pkg, svcs] of Array.from(byPackage.entries()).sort()) {
    indexLines.push(`## ${titleCase(pkg)}`, "");
    for (const svc of svcs.sort((a, b) => a.name.localeCompare(b.name))) {
      indexLines.push(`* [${svc.name}](${kebab(svc.name)}.md) — ${svc.methods.length} methods`);
    }
    indexLines.push("");
  }
  writeOkf(path.join(OKF_OUTPUT, "services", "index.md"), indexLines.join("\n"));

  for (const svc of services) {
    const lines = [
      "---",
      "type: Tutors Service",
      `title: ${svc.name}`,
      `description: Service from @tutors/${svc.package}`,
      `tags: [service, ${svc.package}]`,
      "generated:",
      "  by: process:generate-okf",
      `  at: ${timestamp}`,
      "status: stable",
      "---",
      "",
      `# ${svc.name}`,
      "",
      `**File**: \`${svc.file}\``,
      `**Package**: \`@tutors/${svc.package}\``,
      "",
      "# Methods",
      "",
    ];

    for (const method of svc.methods) {
      lines.push(`- \`${method}()\``);
    }

    lines.push("");
    writeOkf(path.join(OKF_OUTPUT, "services", `${kebab(svc.name)}.md`), lines.join("\n"));
  }
}

// --- Main ---

function main(): void {
  console.log("Generating Tutors OKF knowledge bundle...\n");

  const timestamp = generateTimestamp();

  // Extract all data
  const packages = extractPackages();
  console.log(`Extracted ${packages.length} packages`);

  const routes = extractRoutes();
  console.log(`Extracted ${routes.length} routes`);

  const components = extractComponents();
  console.log(`Extracted ${components.length} components`);

  const types = extractTypes();
  console.log(`Extracted ${types.length} types`);

  const schemas = extractSchemas();
  console.log(`Extracted ${schemas.length} schemas`);

  const services = extractServices();
  console.log(`Extracted ${services.length} services`);

  // Clean output directory
  if (fs.existsSync(OKF_OUTPUT)) {
    fs.rmSync(OKF_OUTPUT, { recursive: true });
  }

  // Generate bundle
  writeOkf(
    path.join(OKF_OUTPUT, "index.md"),
    generateBundleIndex(packages, routes.length, components.length, types.length, schemas.length, services.length)
  );

  const counts = { packages: packages.length, routes: routes.length, components: components.length, types: types.length, schemas: schemas.length, services: services.length };
  writeOkf(path.join(OKF_OUTPUT, "log.md"), generateLog(counts));

  generatePackagesConcepts(packages, timestamp);
  generateComponentConcepts(components, timestamp);
  generateRouteConcepts(routes, timestamp);
  generateTypeConcepts(types, timestamp);
  generateSchemaConcepts(schemas, timestamp);
  generateServiceConcepts(services, timestamp);

  const totalFiles = packages.length + components.length + routes.length + types.length + schemas.length + services.length + 8; // +8 for index files
  console.log(`\nOKF bundle written to okf/`);
  console.log(`  ~${totalFiles} total files`);
}

main();
