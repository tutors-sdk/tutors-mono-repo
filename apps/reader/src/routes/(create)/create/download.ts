import { zipSync, strToU8 } from "fflate";
import type { GeneratedFile } from "@tutors/tutors-create/generate";

/**
 * Zip the generated Markdown source and trigger a browser download.
 * Everything is nested under the course folder so unzipping yields one named dir.
 */
export function downloadCourseZip(files: GeneratedFile[], courseId: string): void {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[`${courseId}/${file.relativePath}`] = strToU8(file.content);
  }
  const blob = new Blob([zipSync(entries)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = courseId + ".zip";
  a.click();
  URL.revokeObjectURL(url);
}
