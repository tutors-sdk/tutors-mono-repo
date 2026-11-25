import process from "node:process";
import { useCliOutput } from "@tutors/logger-core";
import { runTutorsLite } from "./src/run.ts";
import { versionLine } from "./src/version.ts";

// What the generator reports reads as one short line a person can act on (Rule 0292).
useCliOutput("tutors-lite");

// No template folder: the generator renders with the templates bundled into this release.
// exitCode, not exit(): let stdout and stderr drain before the process ends.
process.exitCode = await runTutorsLite(process.cwd());
process.stdout.write(`${versionLine}\n`);
