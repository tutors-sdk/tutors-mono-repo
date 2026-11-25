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

/**
 * Key for the lab a lo_id belongs to: its path up to and including the segment that starts with "book".
 * Two topics may each hold a lab with the same id, so the id alone does not name one lab.
 * e.g. "/lab/course/topic-01/book-1/step-1" -> "/lab/course/topic-01/book-1". Returns loId when no segment starts with "book".
 */
export function extractLabPath(loId: string): string {
  const segments = loId.split("/");
  const index = segments.findIndex((s) => s.trim().toLowerCase().startsWith("book"));
  return index < 0 ? loId : segments.slice(0, index + 1).join("/");
}

/**
 * Column header for each lab path, in the same order: the lab id, or "topic/lab id" when two labs
 * share an id, or the whole path when that is still ambiguous.
 */
export function labColumnLabels(labs: string[]): string[] {
  const count = (values: string[]) => values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>());
  const ids = labs.map(extractLabIdentifier);
  const withTopic = labs.map((lab, i) => {
    const segments = lab.split("/");
    const parent = segments.length > 1 ? segments[segments.length - 2].trim() : "";
    return parent ? `${parent}/${ids[i]}` : ids[i];
  });
  const idCounts = count(ids);
  const topicCounts = count(withTopic);
  return labs.map((lab, i) => {
    if (idCounts.get(ids[i]) === 1) return ids[i];
    return topicCounts.get(withTopic[i]) === 1 ? withTopic[i] : lab;
  });
}

/** Extract step name from lo_id (last path segment). e.g. "path/to/book-1/step-1" -> "step-1". */
export function extractStepName(loId: string): string {
  const segments = loId.split("/").filter((s) => s.trim().length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : loId;
}

const LAB_NO_DATE_KEY = "__no_date__";

/** UTC date of the record, the same day boundary as the calendar views' DATE ids, whatever the server's timezone. */
function getDateFromLearningRecord(record: LearningRecord): string {
  const d = record.date_last_accessed;
  if (!d) return LAB_NO_DATE_KEY;
  try {
    const date = new Date(d);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return LAB_NO_DATE_KEY;
  }
}

/** Return distinct sorted dates from learning records (date_last_accessed). Records without date use NO_DATE_KEY. */
export function getDistinctSortedDatesFromRecords(records: LearningRecord[]): string[] {
  const validRecords = records.filter((r) => r.lo_id != null);
  const dates = Array.from(new Set(validRecords.map(getDateFromLearningRecord)));
  return dates.sort((a, b) => (a === LAB_NO_DATE_KEY ? 1 : b === LAB_NO_DATE_KEY ? -1 : a.localeCompare(b)));
}

/** Toggle helper for lab view mode. */
export function toggleLabViewMode(current: LabViewMode): LabViewMode {
  return current === "lab" ? "step" : "lab";
}
