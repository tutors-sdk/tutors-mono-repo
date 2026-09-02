import type { CourseSpec } from "./types.ts";
import { slugify, defaultSpec } from "./types.ts";
import { writeCourseToFilesystem, nextStepsMessage } from "./scaffolder.ts";
import denoConfig from "../deno.json" with { type: "json" };

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
  console.log(`\n  Welcome to Tutors Course Creator (${denoConfig.version})\n`);

  const courseName = promptRequired("  Course name:");
  const lecturerName = prompt("  Your name (optional):") || "";
  const courseId = slugify(courseName) || defaultSpec.courseId;
  const unitCount = promptNumber("  Number of units on the home page", 1, 12, defaultSpec.unitCount);
  const includeSide = promptYesNo("  Include a Side unit?", defaultSpec.includeSide);
  const topicsPerUnit = promptNumber("  Number of topics per unit", 1, 12, defaultSpec.topicsPerUnit);
  const includeNotes = promptYesNo("  Include a note in each topic?", defaultSpec.includeNotes);
  const includeLabs = promptYesNo("  Include a lab in each topic?", defaultSpec.includeLabs);
  const includeCalendar = promptYesNo("  Include a calendar?", defaultSpec.includeCalendar);
  const includeEnrollment = promptYesNo("  Include an enrollment list?", defaultSpec.includeEnrollment);

  const spec: CourseSpec = {
    courseName,
    lecturerName: lecturerName.trim(),
    courseId,
    unitCount,
    includeSide,
    topicsPerUnit,
    includeNotes,
    includeLabs,
    includeCalendar,
    includeEnrollment,
  };

  console.log(`\n  Creating course in ./${courseId}/ ...\n`);
  writeCourseToFilesystem(spec, ".");
  console.log(nextStepsMessage(spec));
}
