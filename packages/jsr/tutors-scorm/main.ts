import { copyAssets, generateScormCourse, generateStaticCourse, parseCourse } from "@tutors/tutors-gen-lib";
import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

const versionStr = `tutors-scorm: 5.2.3`;

if (!fs.existsSync("course.md")) {
  console.log("Cannot locate course.md. Please change to course folder and try again.");
} else {
  const srcFolder = process.cwd();
  const destFolder = `${srcFolder}/scorm`;
  // The package payload is an ordinary tutors-lite site; SCORM only wraps it.
  const htmlFolder = `${destFolder}/build`;

  const [course, lr] = parseCourse(srcFolder);
  const localVento = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../gen/src/templates/vento");
  const srcVentoFolder = fs.existsSync(localVento) ? localVento : "";
  await generateStaticCourse(course, htmlFolder, srcVentoFolder);
  copyAssets(lr, htmlFolder);

  for (const version of course.scormVersions) {
    const zip = await generateScormCourse(course, htmlFolder, destFolder, { version, identifier: course.scormIdentifier });
    console.log(`SCORM ${version} package written to ${zip}`);
  }
}
console.log(versionStr);
