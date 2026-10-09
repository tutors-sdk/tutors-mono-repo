import { execFileSync } from "node:child_process";
import { cp, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 17)) throw new Error("Kit 3 requires Node >=22.17");

const repo = fileURLToPath(new URL("../../", import.meta.url));
const work = await mkdtemp(join(tmpdir(), "tutors-identity-compatibility-"));
process.stdout.write(`Building disposable compatibility app in ${work}\n`);

try {
  await cp(join(repo, "tests/fixtures/identity-compatibility"), work, {
    recursive: true,
    filter: (path) => !["node_modules", ".svelte-kit", "build"].includes(basename(path))
  });
  await copyFile(join(repo, "apps/reader/src/lib/server/auth-mode.ts"), join(work, "src/auth-mode.ts"));
  const options = {
    cwd: work,
    stdio: "inherit",
    env: { ...process.env, PRIVATE_AUTH_SECRET: "a-test-secret-that-is-at-least-thirty-two-chars", PUBLIC_ANON_MODE: "FALSE" }
  };
  execFileSync("pnpm", ["install", "--frozen-lockfile"], options);
  execFileSync("pnpm", ["check"], options);
  execFileSync("pnpm", ["build"], options);
  execFileSync(process.execPath, ["compatibility.mjs"], options);
} finally {
  await rm(work, { recursive: true, force: true });
}
