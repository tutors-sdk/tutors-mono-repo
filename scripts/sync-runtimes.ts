/**
 * Copy the in-browser run-times into the reader's static folder.
 *
 * Tutors serves Pyodide and the TypeScript compiler from its own origin rather than from a
 * public CDN. Three reasons, in order of how much they hurt when ignored: the reader's
 * content security policy allows scripts from itself and would have to be opened up for a
 * CDN; a pinned copy cannot change under a course mid-term; and a student on a slow or
 * filtered connection still gets a working playground.
 *
 * The copies are build output, not source — they are gitignored, and this runs before
 * `dev` and `build`.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staticRuntimes = join(root, "apps", "reader", "static", "runtimes");
const require = createRequire(join(root, "apps", "reader", "package.json"));

/** Pyodide's core: the engine, the standard library and the package index. Not the wheels. */
const PYODIDE_FILES = ["pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

function packageDir(name: string): string | null {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

function version(dir: string): string {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
}

function syncPyodide(): string {
  const source = packageDir("pyodide");
  if (!source) {
    console.warn("pyodide is not installed — Python playgrounds will not run. Run pnpm install.");
    return "";
  }
  const dest = join(staticRuntimes, "pyodide");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  for (const file of PYODIDE_FILES) {
    const from = join(source, file);
    // The set of files shipped shifts between Pyodide releases; the ones that exist are
    // the ones that are needed.
    if (existsSync(from)) cpSync(from, join(dest, file));
  }
  const pyodideVersion = version(source);
  console.log(`pyodide ${pyodideVersion} → static/runtimes/pyodide`);
  return pyodideVersion;
}

function syncTypeScript(): string {
  const source = packageDir("typescript");
  if (!source) {
    console.warn("typescript is not installed — TypeScript playgrounds will not run. Run pnpm install.");
    return "";
  }
  const dest = join(staticRuntimes, "typescript");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, "lib"), { recursive: true });

  cpSync(join(source, "lib", "typescript.js"), join(dest, "typescript.js"));
  // The declaration files are what turns transpilation into type checking: without them
  // the compiler cannot resolve so much as `console`.
  for (const file of readdirSync(join(source, "lib"))) {
    if (file.startsWith("lib.") && file.endsWith(".d.ts")) {
      cpSync(join(source, "lib", file), join(dest, "lib", file));
    }
  }
  const typescriptVersion = version(source);
  console.log(`typescript ${typescriptVersion} → static/runtimes/typescript`);
  return typescriptVersion;
}

/**
 * KaTeX's stylesheet and fonts, for notebooks that contain maths.
 *
 * Same reasoning as the run-times, plus one that is not optional: the reader's policy
 * allows stylesheets from itself, so the CDN copy the notebook used to link was refused
 * outright in production and every formula rendered as unstyled markup.
 */
function syncKatex(): string {
  const source = packageDir("katex");
  if (!source) {
    console.warn("katex is not installed — notebook maths will render unstyled. Run pnpm install.");
    return "";
  }
  const dest = join(staticRuntimes, "katex");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  cpSync(join(source, "dist", "katex.min.css"), join(dest, "katex.min.css"));
  cpSync(join(source, "dist", "fonts"), join(dest, "fonts"), { recursive: true });

  const katexVersion = version(source);
  console.log(`katex ${katexVersion} → static/runtimes/katex`);
  return katexVersion;
}

const pyodideVersion = syncPyodide();
const typescriptVersion = syncTypeScript();
const katexVersion = syncKatex();

/**
 * Where a playground that declares `packages:` gets them.
 *
 * Only the core run-time is self-hosted, so a course asking for numpy has to be served
 * from somewhere that carries the wheels. That is opt-in per playground, and the reader's
 * run-time frame is the only thing allowed to reach it.
 */
const pythonPackageIndex = process.env.TUTORS_PYODIDE_PACKAGE_INDEX ?? (pyodideVersion ? `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/` : "");

writeFileSync(
  join(staticRuntimes, "config.json"),
  `${JSON.stringify(
    {
      pyodide: { path: "pyodide/", version: pyodideVersion },
      typescript: { path: "typescript/", version: typescriptVersion },
      katex: { path: "katex/", version: katexVersion },
      pythonPackageIndex
    },
    null,
    2
  )}\n`
);
console.log("wrote static/runtimes/config.json");
