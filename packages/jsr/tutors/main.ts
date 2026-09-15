import {
  parseCourse,
  generateDynamicCourse,
  copyAssets,
} from "@tutors/tutors-gen-lib";
import * as fs from "node:fs";
import process from "node:process";
import denoConfig from "./deno.json" with { type: "json" };

const versionStr = `tutors: ${denoConfig.version}`;

if (!fs.existsSync("course.md")) {
  console.log("Cannot locate course.md. Please change to course folder and try again.");
} else {
  const srcFolder = process.cwd();
  const destFolder = `${srcFolder}/json`;
  const [course, lr] = parseCourse(srcFolder);
  generateDynamicCourse(course, destFolder);
  copyAssets(lr, destFolder);
}
console.log(versionStr);  