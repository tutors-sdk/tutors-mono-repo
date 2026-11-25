// Rule 0776 (issue #601): the static reader as a release asset Tutors Studio can download and verify.
//
//   node scripts/release/static-reader-asset.mjs pack <build folder> <version> <out folder>
//       writes tutors-reader-static-<version>.tar.gz and SHA256SUMS into <out folder>
//   node scripts/release/static-reader-asset.mjs verify <folder>
//       checks every file SHA256SUMS lists in <folder>; exit 1 on a mismatch
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const assetName = (version) => `tutors-reader-static-${version}.tar.gz`;

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Packs a static reader build. Refuses a folder that is not one (no 200.html or version.json) or another version. */
export function pack(build, version, out) {
  for (const required of ["200.html", "version.json"]) {
    if (!existsSync(join(build, required))) throw new Error(`${build} is not a static reader build: ${required} is missing`);
  }
  const built = JSON.parse(readFileSync(join(build, "version.json"), "utf8"));
  if (built.version !== version) throw new Error(`${build} is version ${built.version}, not ${version}`);
  mkdirSync(out, { recursive: true });
  const name = assetName(version);
  // Sorted, owner-less and undated, so two packs of one build are the same bytes.
  execFileSync("tar", ["--sort=name", "--owner=0", "--group=0", "--numeric-owner", "--mtime=@0", "-czf", resolve(out, name), "-C", build, "."], {
    stdio: "inherit",
    env: { ...process.env, GZIP: "-n" }
  });
  writeFileSync(join(out, "SHA256SUMS"), `${sha256(join(out, name))}  ${name}\n`);
  return name;
}

/** Each file SHA256SUMS lists that is missing from `folder` or hashes differently. */
export function verify(folder) {
  const problems = [];
  for (const line of readFileSync(join(folder, "SHA256SUMS"), "utf8").split("\n").filter(Boolean)) {
    const [hash, name] = line.split(/\s+\*?/);
    const file = join(folder, name);
    if (!existsSync(file)) problems.push(`${name}: missing`);
    else if (sha256(file) !== hash) problems.push(`${name}: checksum does not match`);
  }
  return problems;
}

if (process.argv[1]?.endsWith("static-reader-asset.mjs")) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "pack" && rest.length === 3) {
    process.stdout.write(`${pack(rest[0], rest[1], rest[2])}\n`);
  } else if (command === "verify" && rest.length === 1) {
    const problems = verify(rest[0]);
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    process.exit(problems.length === 0 ? 0 : 1);
  } else {
    process.stderr.write("usage: static-reader-asset.mjs pack <build> <version> <out> | verify <folder>\n");
    process.exit(2);
  }
}
