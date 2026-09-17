import { zipSync, strToU8 } from "fflate";
import type { GeneratedFile, CourseSpec } from "@tutors/tutors-create/generate";

export function downloadCourseZip(files: GeneratedFile[], courseId: string, spec: CourseSpec): void {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[`${courseId}/${file.relativePath}`] = strToU8(file.content);
  }
  entries[`${courseId}/course.json`] = strToU8(JSON.stringify(spec, null, 2));
  const blob = new Blob([zipSync(entries)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = courseId + ".zip";
  a.click();
  URL.revokeObjectURL(url);
}
