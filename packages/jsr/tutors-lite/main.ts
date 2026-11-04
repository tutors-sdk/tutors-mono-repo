import process from "node:process";
import { runTutorsLite } from "./src/run.ts";
import { versionLine } from "./src/version.ts";

// No template folder: the generator renders with the templates bundled into this release.
// exitCode, not exit(): let stdout and stderr drain before the process ends.
process.exitCode = await runTutorsLite(process.cwd());
process.stdout.write(`${versionLine}\n`);
