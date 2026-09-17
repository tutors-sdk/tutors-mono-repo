import {
  parseCourse,
  generateStaticCourse,
  copyAssets
} from "@tutors/tutors-gen-lib";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const versionStr = `tutors-lite: 5.0.9`;

if (!fs.existsSync("course.md")) {
  console.log("Cannot locate course.md. Please change to course folder and try again.");
} else {
  const srcFolder = process.cwd();
  const destFolder = `${srcFolder}/html`;
  const [course, lr] = parseCourse(srcFolder);
  // fileURLToPath, not URL.pathname: on Windows the pathname is "/D:/..." and the local
  // templates are never found, so templates are silently downloaded from GitHub main.
  const moduleUrl = new URL(import.meta.url);
  const localVento = moduleUrl.protocol === "file:" ? path.resolve(path.dirname(fileURLToPath(moduleUrl)), "../gen/src/templates/vento") : "";
  const srcVentoFolder = fs.existsSync(localVento) ? localVento : "";
  await generateStaticCourse(course, destFolder, srcVentoFolder);
  copyAssets(lr, destFolder);
}
console.log(versionStr);
