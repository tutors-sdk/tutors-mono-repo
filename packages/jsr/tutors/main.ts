import {
  parseCourse,
  generateDynamicCourse,
  copyAssets,
} from "@tutors/tutors-gen-lib";
import * as fs from "node:fs";
import process from "node:process";
import log, { useCliOutput } from "@tutors/logger-core";
import denoConfig from "./deno.json" with { type: "json" };

const versionStr = `tutors: ${denoConfig.version}`;

useCliOutput("tutors");

if (!fs.existsSync("course.md")) {
  log.error("Cannot locate course.md. Please change to course folder and try again.");
} else {
  const srcFolder = process.cwd();
  const destFolder = `${srcFolder}/json`;
  const [course, lr] = parseCourse(srcFolder);
  generateDynamicCourse(course, destFolder);
  copyAssets(lr, destFolder);
}
process.stdout.write(`${versionStr}\n`);  