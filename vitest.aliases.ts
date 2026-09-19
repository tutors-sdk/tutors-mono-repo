import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

/**
 * Module aliases shared by vitest.config.ts and vitest.config.fuzz.ts, so both
 * tiers resolve the workspace libraries the same way.
 *
 * packages/jsr/* are Deno packages with no node_modules of their own, so every
 * npm import they make must be aliased here, resolved by name from the workspace
 * package that declares it. Never rely on the import resolving by walking up
 * directories: it can work locally and fail on CI. A `deno run` at the repo root
 * rewrites node_modules into a hoisted layout, and a git worktree nested inside
 * another checkout falls back to that checkout's node_modules.
 */
const root = __dirname;
// `createRequire(import.meta.url)` + `require.resolve` is the form knip reads as a use of a root devDependency.
const require = createRequire(import.meta.url);
const fromCourse = createRequire(resolve(root, "packages/svelte/course/package.json"));

const jsYaml = require.resolve("js-yaml");
const ventoStub = resolve(root, "tests/support/vento-stub.ts");

export const workspaceAliases: Record<string, string> = {
  "@tutors/tutors-model-lib": resolve(root, "packages/jsr/model/src/tutors.ts"),
  "@tutors/tutors-gen-lib": resolve(root, "packages/jsr/gen/src/tutors.ts"),
  "@tutors/tutors-time-lib": resolve(root, "packages/jsr/time/src/index.ts"),
  "@tutors/community/utils/supabase-client": resolve(root, "packages/svelte/community/src/utils/supabase-client.ts"),
  "@tutors/logger": resolve(root, "packages/svelte/utils/logger/src/index.ts"),
  "@tutors/metrics": resolve(root, "packages/svelte/utils/metrics/src/index.ts"),
  "$app/environment": resolve(root, "tests/support/sveltekit-stubs.ts"),
  "$app/navigation": resolve(root, "tests/support/sveltekit-stubs.ts"),
  "$app/paths": resolve(root, "tests/support/sveltekit-stubs.ts"),
  // gen-lib's npm imports (plain and Deno `npm:` specifiers)
  "front-matter": require.resolve("front-matter"),
  "js-yaml": jsYaml,
  "npm:js-yaml@^4": jsYaml,
  "npm:archiver@^7": resolve(root, "tests/support/archiver-shim.ts"),
  // gen-lib's Marp renderer; @tutors/course is the workspace package that declares marp-core
  "@marp-team/marp-core": fromCourse.resolve("@marp-team/marp-core"),
  "@vento/vento": ventoStub,
  "jsr:@vento/vento@1.14.0/plugins/auto_trim.ts": ventoStub
};

// Fail at config load, naming the alias, rather than as ERR_MODULE_NOT_FOUND deep in a suite.
for (const [name, target] of Object.entries(workspaceAliases)) {
  if (!existsSync(target)) throw new Error(`vitest alias ${name} points at ${target}, which does not exist`);
}
