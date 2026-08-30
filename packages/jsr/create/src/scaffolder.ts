import * as fs from "node:fs";
import * as path from "node:path";
import type { CourseSpec } from "./types.ts";
import { padNumber, LAB_STEP_COUNT } from "./types.ts";
import { courseMd, propertiesYaml, unitMd, topicMd, labSetupMd, labStepMd, talkMd, talkMarp, noteMd } from "./templates.ts";

export interface GeneratedFile {
  relativePath: string;
  content: string;
}

/** Emit the talk descriptor + starter Marp deck for a talk folder. */
function talkFiles(talkDir: string, topicNumber: number, talkSlug: string): GeneratedFile[] {
  return [
    { relativePath: `${talkDir}/${talkSlug}.md`, content: talkMd(topicNumber) },
    { relativePath: `${talkDir}/talk.marp`, content: talkMarp(topicNumber) },
  ];
}

/** Emit a lab (Setup step + a fixed number of instruction steps). */
function labFiles(labDir: string, labName: string): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { relativePath: `${labDir}/00.Setup.md`, content: labSetupMd(labName) },
  ];
  for (let s = 1; s <= LAB_STEP_COUNT; s++) {
    files.push({ relativePath: `${labDir}/${padNumber(s)}.Step-${padNumber(s)}.md`, content: labStepMd(s, LAB_STEP_COUNT) });
  }
  return files;
}

export function generateCourseFiles(spec: CourseSpec): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  files.push({ relativePath: "course.md", content: courseMd(spec) });
  files.push({ relativePath: "properties.yaml", content: propertiesYaml(spec) });

  // Side unit: a single talk and note displayed in the sidebar.
  if (spec.includeSide) {
    files.push(...talkFiles("side/talk-01", 1, "talk-01"));
    files.push({ relativePath: "side/note-01/note-01.md", content: noteMd(1) });
  }

  // Units on the home page, each holding a set of topics.
  for (let u = 1; u <= spec.unitCount; u++) {
    const unitSlug = `unit-${u}`;
    files.push({ relativePath: `${unitSlug}/unit.md`, content: unitMd(u) });

    for (let t = 1; t <= spec.topicsPerUnit; t++) {
      const topicNum = padNumber(t);
      const topicSlug = `topic-${topicNum}`;
      const topicDir = `${unitSlug}/${topicSlug}`;
      files.push({ relativePath: `${topicDir}/${topicSlug}.md`, content: topicMd(t, `Topic ${t}`) });

      // Every topic gets a talk with a starter Marp deck.
      files.push(...talkFiles(`${topicDir}/talk-${topicNum}`, t, `talk-${topicNum}`));

      if (spec.includeNotes) {
        const noteSlug = `note-${topicNum}`;
        files.push({ relativePath: `${topicDir}/${noteSlug}/${noteSlug}.md`, content: noteMd(t) });
      }
      if (spec.includeLabs) {
        files.push(...labFiles(`${topicDir}/book-lab-01`, "Lab 1"));
      }
    }
  }
  return files;
}

export function writeCourseToFilesystem(spec: CourseSpec, outputDir: string): void {
  const courseDir = path.join(outputDir, spec.courseId);
  const files = generateCourseFiles(spec);
  for (const file of files) {
    const fullPath = path.join(courseDir, file.relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, "utf-8");
  }
}

export { type CourseSpec } from "./types.ts";
export { slugify, defaultSpec } from "./types.ts";
export { nextStepsMessage } from "./templates.ts";
