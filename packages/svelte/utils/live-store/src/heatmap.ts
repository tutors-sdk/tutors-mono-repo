import { SERVICES } from "@tutors/live-events";
import { daysBetween, localDay } from "./metrics.ts";
import type { HourlyRow, HourlySessionRow, Range } from "./types.ts";

/**
 * The heat maps.
 *
 * All three produce the same shape - axis labels plus a `cells[y][x]` matrix -
 * so one component renders them and the API has one response to document.
 * Buckets are read in local time: "Tuesday at 14:00" means the hour the learner
 * was in, not the hour UTC was in.
 */

/** Which heat map to build. */
export const HEATMAP_KINDS = ["service", "service-monthly", "course"] as const;

export type HeatmapKind = (typeof HEATMAP_KINDS)[number];

export function isHeatmapKind(value: unknown): value is HeatmapKind {
  return typeof value === "string" && (HEATMAP_KINDS as readonly string[]).includes(value);
}

export interface HeatmapMatrix {
  kind: HeatmapKind;
  title: string;
  /** Column labels. */
  x: string[];
  /** Row labels. */
  y: string[];
  /** `cells[row][column]`, always fully populated. */
  cells: number[][];
  /** Largest cell, so the caller does not walk the matrix to scale the colours. */
  max: number;
  /** How the UI should map a value onto the colour ramp. */
  scale: "log" | "linear";
  /** What one unit of a cell is, for the legend and the tooltip. */
  unit: string;
}

/** Monday first: an academic week starts on Monday, and the weekend reads as a block. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const HOURS = Array.from({ length: 24 }, (_, hour) => `${hour}`.padStart(2, "0"));

function emptyCells(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
}

function maxOf(cells: number[][]): number {
  return cells.reduce((largest, row) => Math.max(largest, ...row), 0);
}

/** Row index for a weekday, with Monday at 0. */
function weekdayRow(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Service touches by hour of day and day of week. The first heat map on the dashboard. */
export function serviceHourHeatmap(hourly: HourlyRow[]): HeatmapMatrix {
  const cells = emptyCells(WEEKDAYS.length, HOURS.length);
  for (const row of hourly) {
    if (!row.service || row.serviceTouches === 0) continue;
    const at = new Date(Date.parse(row.bucket));
    cells[weekdayRow(at)][at.getHours()] += row.serviceTouches;
  }
  return {
    kind: "service",
    title: "Service usage by hour",
    x: HOURS,
    y: WEEKDAYS,
    cells,
    max: maxOf(cells),
    // Term-time evenings dwarf everything else; on a linear ramp the rest of the
    // week is one flat colour.
    scale: "log",
    unit: "service touches"
  };
}

/** Service touches by service and day, over whatever the range covers. */
export function serviceDayHeatmap(range: Range, hourly: HourlyRow[]): HeatmapMatrix {
  const days = daysBetween(range.from, range.to);
  const index = new Map(days.map((day, column) => [day, column]));
  const cells = emptyCells(SERVICES.length, days.length);

  for (const row of hourly) {
    if (!row.service) continue;
    const column = index.get(localDay(row.bucket));
    const serviceRow = SERVICES.indexOf(row.service as (typeof SERVICES)[number]);
    if (column === undefined || serviceRow < 0) continue;
    cells[serviceRow][column] += row.serviceTouches;
  }

  return {
    kind: "service-monthly",
    title: "Service usage by day",
    x: days,
    y: [...SERVICES],
    cells,
    max: maxOf(cells),
    scale: "linear",
    unit: "service touches"
  };
}

/** Sessions by course and day: which courses are alive, and when. */
export function courseActivityHeatmap(range: Range, hourlySessions: HourlySessionRow[], limit = 20): HeatmapMatrix {
  const days = daysBetween(range.from, range.to);
  const index = new Map(days.map((day, column) => [day, column]));

  const totals = new Map<string, number>();
  for (const row of hourlySessions) totals.set(row.course, (totals.get(row.course) ?? 0) + row.sessions);
  const courses = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([course]) => course);
  const courseRow = new Map(courses.map((course, row) => [course, row]));

  const cells = emptyCells(courses.length, days.length);
  for (const row of hourlySessions) {
    const column = index.get(localDay(row.bucket));
    const rowIndex = courseRow.get(row.course);
    if (column === undefined || rowIndex === undefined) continue;
    cells[rowIndex][column] += row.sessions;
  }

  return {
    kind: "course",
    title: "Course activity",
    x: days,
    y: courses,
    cells,
    max: maxOf(cells),
    scale: "linear",
    unit: "sessions"
  };
}

/**
 * A cell's position on the colour ramp, 0 to 1.
 * Exported so the SVG and the tests agree on what "log scale" means here.
 */
export function cellIntensity(value: number, max: number, scale: HeatmapMatrix["scale"]): number {
  if (value <= 0 || max <= 0) return 0;
  if (scale === "linear") return Math.min(1, value / max);
  return Math.min(1, Math.log1p(value) / Math.log1p(max));
}
