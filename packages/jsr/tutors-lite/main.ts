import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { runTutorsLite } from "./src/run.ts";

const versionStr = `tutors-lite: 5.0.9`;

// fileURLToPath, not URL.pathname: on Windows the pathname is "/D:/..." and the local
// templates are never found, so templates are silently downloaded from GitHub main.
const moduleUrl = new URL(import.meta.url);
const localVento = moduleUrl.protocol === "file:" ? path.resolve(path.dirname(fileURLToPath(moduleUrl)), "../gen/src/templates/vento") : "";
const srcVentoFolder = fs.existsSync(localVento) ? localVento : "";
// exitCode, not exit(): let stdout and stderr drain before the process ends.
process.exitCode = await runTutorsLite(process.cwd(), srcVentoFolder);
process.stdout.write(`${versionStr}\n`);
