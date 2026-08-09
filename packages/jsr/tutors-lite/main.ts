import {
  parseCourse,
  generateStaticCourse,
  copyAssets
} from "@tutors/tutors-gen-lib";
import * as fs from "node:fs";
import process from "node:process";

const versionStr = `tutors-lite: 5.0.6`;

if (!fs.existsSync("course.md")) {
  console.log("Cannot locate course.md. Please change to course folder and try again.");
} else {
  const srcFolder = process.cwd();
  const destFolder = `${srcFolder}/html`;
  const [course, lr] = parseCourse(srcFolder);
  await generateStaticCourse(course, destFolder);
  copyAssets(lr, destFolder);
}
console.log(versionStr);
