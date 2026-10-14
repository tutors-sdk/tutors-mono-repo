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
const fromCourse = createRequire(resolve(root, "packages/adapters/driving/svelte-state/package.json"));

const jsYaml = require.resolve("js-yaml");
const ventoStub = resolve(root, "tests/support/vento-stub.ts");

export const workspaceAliases: Record<string, string> = {
  // Rings. Subpaths come before their package so the longer alias matches first.
  "@tutors/domain/course/vocabulary": resolve(root, "packages/domain/src/course/vocabulary.ts"),
  "@tutors/domain/course": resolve(root, "packages/domain/src/course/index.ts"),
  "@tutors/domain/learning": resolve(root, "packages/domain/src/learning/index.ts"),
  "@tutors/domain/presence": resolve(root, "packages/domain/src/presence/index.ts"),
  "@tutors/domain/access": resolve(root, "packages/domain/src/access/index.ts"),
  "@tutors/domain/pedagogy": resolve(root, "packages/domain/src/pedagogy/index.ts"),
  "@tutors/domain/quiz": resolve(root, "packages/domain/src/quiz/index.ts"),
  "@tutors/domain": resolve(root, "packages/domain/src/index.ts"),
  "@tutors/application/ports": resolve(root, "packages/application/src/ports/index.ts"),
  "@tutors/application/testing": resolve(root, "packages/application/src/testing/index.ts"),
  "@tutors/application": resolve(root, "packages/application/src/index.ts"),
  "@tutors/render-markdown": resolve(root, "packages/adapters/driven/render-markdown/src/index.ts"),
  "@tutors/tutors-model-lib": resolve(root, "packages/jsr/model/src/tutors.ts"),
  "@tutors/tutors-gen-lib": resolve(root, "packages/jsr/gen/src/tutors.ts"),
  "@tutors/tutors-time-lib": resolve(root, "packages/jsr/time/src/index.ts"),
  "@tutors/tutors-types": resolve(root, "packages/jsr/types/src/index.ts"),
  "@tutors/svelte-state/community/utils/supabase-client": resolve(root, "packages/adapters/driving/svelte-state/src/community/utils/supabase-client.ts"),
  "@tutors/identity": resolve(root, "packages/jsr/identity/src/index.ts"),
  "@tutors/identity-better-auth/server": resolve(root, "packages/adapters/driven/identity-better-auth/src/index.server.ts"),
  "@tutors/identity-better-auth/client": resolve(root, "packages/adapters/driven/identity-better-auth/src/client.ts"),
  "@tutors/logger": resolve(root, "packages/platform/logger/src/index.ts"),
  "@tutors/metrics": resolve(root, "packages/platform/metrics/src/index.ts"),
  "@tutors/clock": resolve(root, "packages/adapters/driven/clock/src/index.ts"),
  "$app/env/public": resolve(root, "tests/support/public-env-stub.ts"),
  "$app/env/private": resolve(root, "tests/support/private-env-stub.ts"),
  "$app/env": resolve(root, "tests/support/sveltekit-stubs.ts"),
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
