import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, toPosix } from "../../scripts/checks/lib/repo.ts";
import { workspaceAliases } from "../../vitest.aliases.ts";

/**
 * A package that moves keeps three sets of wiring in step: the test runner's aliases, the Deno
 * workspace (what `deno publish`, `deno compile` and the lecturer's `deno run` resolve) and each
 * package's exports. The unit tests only exercise the first, so a move can pass every test here and
 * still fail in the Deno jobs or for a lecturer. These tests read the other two.
 */
type Manifest = { name?: string; exports?: string | Record<string, string>; imports?: Record<string, string>; workspace?: string[] };

const readJson = (path: string): Manifest => JSON.parse(readFileSync(path, "utf8")) as Manifest;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return ["node_modules", "test", "dist", "coverage", ".svelte-kit"].includes(entry.name) ? [] : sourceFiles(join(dir, entry.name));
    return /\.ts$/.test(entry.name) && !/\.(d|test)\.ts$/.test(entry.name) ? [join(dir, entry.name)] : [];
  });
}

/** Every module specifier a file names: imports, re-exports and dynamic `import()`. */
export function specifiersOf(file: string, text = readFileSync(file, "utf8")): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) found.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const exportsOf = (manifest: Manifest): Record<string, string> => (typeof manifest.exports === "string" ? { ".": manifest.exports } : (manifest.exports ?? {}));

/** `@tutors/domain/course` is package `@tutors/domain`, subpath `./course`. */
function split(specifier: string): { name: string; subpath: string } {
  const [scope, name, ...rest] = specifier.split("/");
  return { name: `${scope}/${name}`, subpath: rest.length > 0 ? `./${rest.join("/")}` : "." };
}

/**
 * The `@tutors/*` imports of one Deno workspace member that Deno could not resolve: the package is
 * neither another member nor in the member's own import map, or the member it names has no such export.
 */
export function unresolvedInDeno(specifiers: string[], own: Manifest, members: Map<string, Manifest>): string[] {
  return [...new Set(specifiers.filter((specifier) => specifier.startsWith("@tutors/")))].flatMap((specifier) => {
    const { name, subpath } = split(specifier);
    const member = members.get(name);
    if (member) return subpath in exportsOf(member) ? [] : [`${specifier}: ${name} has no export "${subpath}"`];
    return own.imports && name in own.imports ? [] : [`${specifier}: ${name} is not a Deno workspace member and is not in the import map`];
  });
}

describe("workspace wiring", () => {
  const root = readJson(join(REPO_ROOT, "deno.json"));
  const memberDirs = (root.workspace ?? []).map((path) => join(REPO_ROOT, path));
  const members = new Map(memberDirs.map((dir) => [readJson(join(dir, "deno.json")).name ?? dir, readJson(join(dir, "deno.json"))]));

  it("every alias of the test runner points at a file that exists", () => {
    const missing = Object.entries(workspaceAliases).filter(([, target]) => !existsSync(target)).map(([name, target]) => `${name} -> ${toPosix(target)}`);
    expect(Object.keys(workspaceAliases).length).toBeGreaterThan(40);
    expect(missing).toEqual([]);
  });

  it("every Deno workspace member exists, is named, and exports files that exist", () => {
    expect(memberDirs.length).toBeGreaterThan(8);
    const broken = memberDirs.flatMap((dir) => {
      if (!existsSync(join(dir, "deno.json"))) return [`${toPosix(dir)}: no deno.json`];
      const manifest = readJson(join(dir, "deno.json"));
      const lost = Object.entries(exportsOf(manifest)).filter(([, file]) => !existsSync(join(dir, file))).map(([key, file]) => `${toPosix(dir)}: export "${key}" -> ${file} does not exist`);
      return manifest.name?.startsWith("@tutors/") ? lost : [`${toPosix(dir)}: not named @tutors/<name>`, ...lost];
    });
    expect(broken).toEqual([]);
  });

  it("a Deno member's package.json, where it has one, exports the same files under the same name", () => {
    const drift = memberDirs.flatMap((dir) => {
      const nodeManifest = join(dir, "package.json");
      if (!existsSync(nodeManifest)) return [];
      const deno = readJson(join(dir, "deno.json"));
      const node = readJson(nodeManifest);
      return deno.name === node.name && JSON.stringify(exportsOf(deno)) === JSON.stringify(exportsOf(node)) ? [] : [toPosix(dir)];
    });
    expect(drift).toEqual([]);
  });

  it("every @tutors import in a Deno member resolves to another member's export or the member's import map", () => {
    const unresolved = memberDirs.flatMap((dir) => {
      const own = readJson(join(dir, "deno.json"));
      const specifiers = sourceFiles(dir).flatMap((file) => specifiersOf(file));
      return unresolvedInDeno(specifiers, own, members).map((finding) => `${toPosix(dir)}: ${finding}`);
    });
    expect(unresolved).toEqual([]);
  });

  it("the test runner and Deno agree on which file a member's export is", () => {
    const disagreeing = [...members.entries()].flatMap(([name, manifest]) => {
      const dir = memberDirs.find((candidate) => readJson(join(candidate, "deno.json")).name === name)!;
      return Object.entries(exportsOf(manifest)).flatMap(([subpath, file]) => {
        const alias = workspaceAliases[subpath === "." ? name : `${name}/${subpath.slice(2)}`];
        return alias === undefined || alias === join(dir, file) ? [] : [`${name} ${subpath}: alias ${toPosix(alias)}, deno.json ${toPosix(join(dir, file))}`];
      });
    });
    expect(disagreeing).toEqual([]);
  });

  it("the generator comparison carries every workspace member the generators import", () => {
    // scripts/checks/generator-diff.ts runs the generators from a tree that holds only these paths.
    const script = readFileSync(join(REPO_ROOT, "scripts/checks/generator-diff.ts"), "utf8");
    const carried: string[] = JSON.parse(/const GENERATOR_PATHS = (\[[^\]]*\]);/.exec(script)![1]);
    const dirOf = new Map(memberDirs.map((dir) => [readJson(join(dir, "deno.json")).name, toPosix(dir)]));
    const reached = new Set<string>();
    const visit = (dir: string) => {
      if (reached.has(dir)) return;
      reached.add(dir);
      for (const specifier of sourceFiles(join(REPO_ROOT, dir)).flatMap((file) => specifiersOf(file))) {
        const next = specifier.startsWith("@tutors/") ? dirOf.get(split(specifier).name) : undefined;
        if (next) visit(next);
      }
    };
    for (const generator of ["packages/jsr/tutors", "packages/jsr/tutors-lite"]) visit(generator);
    expect(reached.size).toBeGreaterThan(4);
    const left = [...reached].filter((dir) => !carried.some((path) => dir === path || dir.startsWith(`${path}/`)));
    expect(left).toEqual([]);
  });

  describe("negative fixtures", () => {
    const domain: Manifest = { name: "@tutors/domain", exports: { ".": "./src/index.ts", "./course": "./src/course/index.ts" } };
    const known = new Map([["@tutors/domain", domain]]);

    it("accepts a member's export, an import-map entry and anything outside @tutors", () => {
      const own: Manifest = { imports: { "@tutors/tutors-model-lib": "jsr:@tutors/tutors-model-lib@^5.3.0" } };
      expect(unresolvedInDeno(["@tutors/domain", "@tutors/domain/course", "@tutors/tutors-model-lib", "node:fs", "./local.ts"], own, known)).toEqual([]);
    });

    it("names a package that is neither a member nor in the import map", () => {
      expect(unresolvedInDeno(["@tutors/logger"], {}, known)).toEqual(["@tutors/logger: @tutors/logger is not a Deno workspace member and is not in the import map"]);
    });

    it("names a subpath the member does not export, once however often it is imported", () => {
      expect(unresolvedInDeno(["@tutors/domain/secret", "@tutors/domain/secret"], {}, known)).toEqual(['@tutors/domain/secret: @tutors/domain has no export "./secret"']);
    });

    it("reads static, re-exported and dynamic imports", () => {
      const text = 'import a from "@tutors/a";\nexport { b } from "@tutors/b";\nexport * from "./c.ts";\nconst d = await import("@tutors/d");\nconst e = load("@tutors/not-an-import");';
      expect(specifiersOf("x.ts", text)).toEqual(["@tutors/a", "@tutors/b", "./c.ts", "@tutors/d"]);
    });
  });
});

