// Rule 0775 (issue #602): on a Tutors release, publish to JSR every library whose deno.json version JSR does
// not have yet, each library before the libraries that import it. Plain Node and Deno, no install.
//
//   node scripts/release/jsr-publish.mjs plan       print the paths to publish, in order, one per line
//
// The workflow (.github/workflows/jsr-publish.yml) runs `deno publish` in each printed path. When release-please
// (#472) lands, its config should list packages/jsr/course-rules before packages/jsr/create.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The libraries Tutors publishes to JSR. types, identity and realtime are used only inside this repository. */
export const PUBLISHED = ["packages/jsr/model", "packages/jsr/time", "packages/jsr/gen", "packages/jsr/course-rules", "packages/jsr/create", "packages/jsr/tutors-lite", "packages/jsr/tutors"];

/** name, version and the @tutors packages a library imports from JSR, read from its deno.json. */
export function libraryAt(root, path) {
  const config = JSON.parse(readFileSync(join(root, path, "deno.json"), "utf8"));
  const imports = Object.values(config.imports ?? {})
    .map((spec) => /^jsr:(@tutors\/[^@]+)@/.exec(String(spec))?.[1])
    .filter(Boolean);
  return { path, name: config.name, version: config.version, imports };
}

/**
 * The libraries to publish, in an order where each comes after every @tutors library it imports. `has(name,
 * version)` says whether JSR already serves that version; those are left out. Throws on an import cycle.
 */
export async function publishPlan(libraries, has) {
  const byName = new Map(libraries.map((library) => [library.name, library]));
  const ordered = [];
  const state = new Map();
  const visit = (library, trail) => {
    if (state.get(library.name) === "done") return;
    if (state.get(library.name) === "visiting") throw new Error(`import cycle: ${[...trail, library.name].join(" -> ")}`);
    state.set(library.name, "visiting");
    for (const name of library.imports) {
      const dependency = byName.get(name);
      if (dependency) visit(dependency, [...trail, library.name]);
    }
    state.set(library.name, "done");
    ordered.push(library);
  };
  for (const library of libraries) visit(library, []);
  const missing = [];
  for (const library of ordered) if (!(await has(library.name, library.version))) missing.push(library);
  return missing;
}

/** Whether jsr.io serves `name@version`, from the package's meta.json. */
export async function jsrHas(name, version) {
  const response = await fetch(`https://jsr.io/${name}/meta.json`, { headers: { accept: "application/json" } });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`jsr.io answered ${response.status} for ${name}`);
  const meta = await response.json();
  return Boolean(meta.versions?.[version]);
}

if (process.argv[1]?.endsWith("jsr-publish.mjs")) {
  const [command] = process.argv.slice(2);
  if (command !== "plan") {
    process.stderr.write("usage: jsr-publish.mjs plan\n");
    process.exit(2);
  }
  const plan = await publishPlan(PUBLISHED.map((path) => libraryAt(process.cwd(), path)), jsrHas);
  for (const library of plan) process.stdout.write(`${library.path}\t${library.name}@${library.version}\n`);
}
