import {
  parseCourse,
  generateStaticCourse,
  copyAssets
} from "@tutors/tutors-gen-lib";
import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

const versionStr = `tutors-lite: 5.0.8`;

if (!fs.existsSync("course.md")) {
  console.log("Cannot locate course.md. Please change to course folder and try again.");
} else {
  const srcFolder = process.cwd();
  const destFolder = `${srcFolder}/html`;
  const [course, lr] = parseCourse(srcFolder);
  const localVento = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../gen/src/templates/vento");
  const srcVentoFolder = fs.existsSync(localVento) ? localVento : "";
  await generateStaticCourse(course, destFolder, srcVentoFolder);
  copyAssets(lr, destFolder);
}
console.log(versionStr);
