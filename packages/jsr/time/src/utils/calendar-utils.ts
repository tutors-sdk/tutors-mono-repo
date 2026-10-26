import type { CalendarEntry } from "../types/index.ts";

// Shared view mode type for calendar grids.
export type ViewMode = "week" | "day";

/** Filter calendar entries by date range (inclusive). */
export function filterByDateRange(
  entries: CalendarEntry[],
  startDate: string | null,
  endDate: string | null
): CalendarEntry[] {
  if (!startDate && !endDate) return entries;
  return entries.filter((entry) => {
    const entryDate = entry.id;
    if (startDate && entryDate < startDate) return false;
    if (endDate && entryDate > endDate) return false;
    return true;
  });
}

/** Return distinct sorted dates (ids) from calendar entries. */
export function getDistinctSortedDates(entries: CalendarEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.id))).sort();
}

/** Compressed date for column headers to minimize width (e.g. "3/2/25" for 3 Feb 2025). */
export function formatDateShort(dateString: string): string {
  try {
    const date = new Date(dateString + "T12:00:00");
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = String(date.getFullYear() % 100).padStart(2, "0");
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
}

/** Time to nearest minute only (e.g. "1h 30", "45").
 *  NOTE: input is already in minutes (converted at load).
 */
export function formatTimeNearestMinute(minutes: number): string {
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}`;
  }
  return `${mins}`;
}

/** Time in minutes only, no hours (e.g. "90", "45").
 *  NOTE: input is already in minutes (converted at load).
 */
export function formatTimeMinutesOnly(minutes: number): string {
  return `${Math.round(minutes)}`;
}

/** Rounded minutes for a cell, or 0 when nothing was recorded. */
export function minutesOf(value: unknown): number {
  const minutes = Math.round(Number(value) || 0);
  return minutes > 0 ? minutes : 0;
}

/**
 * Heat-scale colour on the design tokens, readable with the normal ink in light and dark mode: success tints
 * deepen up to 200 minutes, then danger tints flag unusually long days (the same bands as the educator view).
 */
export function heatColor(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes <= 200) return `color-mix(in srgb, var(--ui-success) ${Math.round(25 + (minutes / 200) * 45)}%, var(--ui-surface))`;
  return `color-mix(in srgb, var(--ui-danger) ${Math.round(30 + Math.min(1, (minutes - 200) / 600) * 40)}%, var(--ui-surface))`;
}

/** Get the Monday date (YYYY-MM-DD) for the week containing the given date. */
export function getMondayForDate(dateString: string): string {
  try {
    const date = new Date(dateString + "T12:00:00");
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday (0) to 6 days back
    const monday = new Date(date);
    monday.setDate(date.getDate() - daysToMonday);
    // Format back to YYYY-MM-DD
    const year = monday.getFullYear();
    const month = String(monday.getMonth() + 1).padStart(2, "0");
    const day = String(monday.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return dateString; // Fallback to original if parsing fails
  }
}

/** Return distinct sorted Monday dates (week identifiers) from calendar entries. */
export function getDistinctSortedWeeks(entries: CalendarEntry[]): string[] {
  const mondayDates = entries.map((e) => getMondayForDate(e.id));
  return Array.from(new Set(mondayDates)).sort();
}
