import * as fs from "node:fs";
import * as path from "node:path";
import type { CourseSpec } from "./types.ts";
import { padNumber } from "./types.ts";
import { courseMd, propertiesYaml, topicMd, labSetupMd, labStepMd, talkMd, noteMd } from "./templates.ts";

export interface GeneratedFile {
  relativePath: string;
  content: string;
}

export function generateCourseFiles(spec: CourseSpec): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  files.push({ relativePath: "course.md", content: courseMd(spec) });
  files.push({ relativePath: "properties.yaml", content: propertiesYaml(spec) });

  for (let t = 1; t <= spec.topicCount; t++) {
    const topicNum = padNumber(t);
    const topicSlug = `topic-${topicNum}`;
    files.push({ relativePath: `${topicSlug}/${topicSlug}.md`, content: topicMd(t, `Topic ${t}`) });

    for (let l = 1; l <= spec.labsPerTopic; l++) {
      const labSlug = `book-lab-${padNumber(l)}`;
      const labDir = `${topicSlug}/${labSlug}`;
      files.push({ relativePath: `${labDir}/00.Setup.md`, content: labSetupMd(`Lab ${l}`) });
      for (let s = 1; s < spec.labStepCount; s++) {
        files.push({ relativePath: `${labDir}/${padNumber(s)}.Step-${padNumber(s)}.md`, content: labStepMd(s, spec.labStepCount) });
      }
    }

    if (spec.includeTalks) {
      const talkSlug = `talk-${topicNum}`;
      files.push({ relativePath: `${topicSlug}/${talkSlug}/${talkSlug}.md`, content: talkMd(t) });
    }
    if (spec.includeNotes) {
      const noteSlug = `note-${topicNum}`;
      files.push({ relativePath: `${topicSlug}/${noteSlug}/${noteSlug}.md`, content: noteMd(t) });
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
