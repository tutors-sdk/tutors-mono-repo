import type { CourseSpec } from "./types.ts";
import { slugify, defaultSpec } from "./types.ts";
import { writeCourseToFilesystem, nextStepsMessage } from "./scaffolder.ts";

function promptRequired(message: string): string {
  const value = prompt(message);
  if (!value || value.trim().length === 0) {
    console.error("This field is required.");
    return promptRequired(message);
  }
  return value.trim();
}

function promptNumber(message: string, min: number, max: number, fallback: number): number {
  const value = prompt(`${message} (${min}-${max}, default: ${fallback})`);
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < min || n > max) {
    console.error(`Please enter a number between ${min} and ${max}.`);
    return promptNumber(message, min, max, fallback);
  }
  return n;
}

function promptYesNo(message: string, fallback: boolean): boolean {
  const value = prompt(`${message} (y/n, default: ${fallback ? "y" : "n"})`);
  if (!value) return fallback;
  return value.toLowerCase().startsWith("y");
}

export function runCli(): void {
  console.log("\n  Welcome to Tutors Course Creator!\n");

  const courseName = promptRequired("  Course name:");
  const lecturerName = prompt("  Your name (optional):") || "";
  const courseId = slugify(courseName) || defaultSpec.courseId;
  const topicCount = promptNumber("  Number of topics", 1, 12, defaultSpec.topicCount);
  const labsPerTopic = promptNumber("  Labs per topic", 0, 4, defaultSpec.labsPerTopic);
  const labStepCount = labsPerTopic > 0 ? promptNumber("  Steps per lab", 2, 8, defaultSpec.labStepCount) : defaultSpec.labStepCount;
  const includeTalks = promptYesNo("  Include talks?", defaultSpec.includeTalks);
  const includeNotes = promptYesNo("  Include notes?", defaultSpec.includeNotes);

  const spec: CourseSpec = {
    courseName,
    lecturerName: lecturerName.trim(),
    courseId,
    topicCount,
    labsPerTopic,
    labStepCount,
    includeTalks,
    includeNotes,
  };

  console.log(`\n  Creating course in ./${courseId}/ ...\n`);
  writeCourseToFilesystem(spec, ".");
  console.log(nextStepsMessage(spec));
}
