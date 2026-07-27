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

/** Background colour by minutes: 0 = white, 1 = light green, 1–200 = deeper green, 200–400 = light red, 400–800 = deep red.
 *  NOTE: input is already in minutes (converted at load).
 */
export function cellColorForMinutes(minutes: number | null | undefined): string {
  const mins = minutes != null ? Number(minutes) : 0;
  const white = { r: 255, g: 255, b: 255 };
  const lightGreen = { r: 200, g: 255, b: 200 };
  const deepGreen = { r: 0, g: 120, b: 0 };
  const lightRed = { r: 255, g: 180, b: 180 }; // Lighter red for 200-400 range
  const deepRed = { r: 180, g: 0, b: 0 }; // Deeper red for 400-800 range
  let r: number;
  let g: number;
  let b: number;
  if (mins <= 0) {
    r = white.r;
    g = white.g;
    b = white.b;
  } else if (mins <= 1) {
    // Transition from white to light green (0-1 minutes)
    const t = mins;
    r = Math.round(white.r + t * (lightGreen.r - white.r));
    g = Math.round(white.g + t * (lightGreen.g - white.g));
    b = Math.round(white.b + t * (lightGreen.b - white.b));
  } else if (mins <= 200) {
    // Transition from light green to deep green (1-200 minutes)
    const t = (mins - 1) / 199;
    r = Math.round(lightGreen.r + t * (deepGreen.r - lightGreen.r));
    g = Math.round(lightGreen.g + t * (deepGreen.g - lightGreen.g));
    b = Math.round(lightGreen.b + t * (deepGreen.b - lightGreen.b));
  } else if (mins <= 400) {
    // Transition from deep green to light red (200-400 minutes)
    const t = (mins - 200) / 200;
    r = Math.round(deepGreen.r + t * (lightRed.r - deepGreen.r));
    g = Math.round(deepGreen.g + t * (lightRed.g - deepGreen.g));
    b = Math.round(deepGreen.b + t * (lightRed.b - deepGreen.b));
  } else {
    // Transition from light red to deep red (400-800 minutes)
    const t = Math.min(1, (mins - 400) / 400);
    r = Math.round(lightRed.r + t * (deepRed.r - lightRed.r));
    g = Math.round(lightRed.g + t * (deepRed.g - lightRed.g));
    b = Math.round(lightRed.b + t * (deepRed.b - lightRed.b));
  }
  return `rgb(${r}, ${g}, ${b})`;
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
