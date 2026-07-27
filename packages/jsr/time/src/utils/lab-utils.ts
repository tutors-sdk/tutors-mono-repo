import type { LearningRecord } from "../types/index.ts";

/** View mode for labs grid (lab vs step). */
export type LabViewMode = "lab" | "step";

/**
 * Extract lab identifier from lo_id.
 * Labs are identified by the segment (string between '/' and '/') that starts with "book".
 */
export function extractLabIdentifier(loId: string): string {
  const segments = loId.split("/");
  for (const segment of segments) {
    if (segment.trim().toLowerCase().startsWith("book")) {
      return segment.trim();
    }
  }
  return loId;
}

/** Extract step name from lo_id (last path segment). e.g. "path/to/book-1/step-1" -> "step-1". */
export function extractStepName(loId: string): string {
  const segments = loId.split("/").filter((s) => s.trim().length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : loId;
}

const LAB_NO_DATE_KEY = "__no_date__";

function getDateFromLearningRecord(record: LearningRecord): string {
  const d = record.date_last_accessed;
  if (!d) return LAB_NO_DATE_KEY;
  try {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return LAB_NO_DATE_KEY;
  }
}

/** Return distinct sorted dates from learning records (date_last_accessed). Records without date use NO_DATE_KEY. */
export function getDistinctSortedDatesFromRecords(records: LearningRecord[]): string[] {
  const validRecords = records.filter((r) => r.lo_id != null);
  if (!validRecords.length) return [];

  const dates = Array.from(new Set(validRecords.map(getDateFromLearningRecord)));
  return dates.sort((a, b) => (a === LAB_NO_DATE_KEY ? 1 : b === LAB_NO_DATE_KEY ? -1 : a.localeCompare(b)));
}

/** Toggle helper for lab view mode. */
export function toggleLabViewMode(current: LabViewMode): LabViewMode {
  return current === "lab" ? "step" : "lab";
}
