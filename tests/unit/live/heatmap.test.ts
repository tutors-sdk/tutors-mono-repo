import { describe, expect, it } from "vitest";
import { SERVICES } from "@tutors/live-events";
import {
  HEATMAP_KINDS,
  cellIntensity,
  courseActivityHeatmap,
  isHeatmapKind,
  rangeFor,
  serviceDayHeatmap,
  serviceHourHeatmap,
  type HourlyRow,
  type HourlySessionRow
} from "@tutors/live-store";

/**
 * The heat maps.
 *
 * Buckets are read in local time, and a matrix is always rectangular and fully
 * populated - a ragged `cells` array would draw a hole in the grid rather than
 * a cold cell.
 */

const now = new Date(2026, 8, 17, 14, 0);

/** A rollup row at a local hour on a given day, so the axes can be asserted. */
function rowAt(dayOffset: number, hour: number, overrides: Partial<HourlyRow> = {}): HourlyRow {
  const at = new Date(now.getTime());
  at.setDate(at.getDate() - dayOffset);
  at.setHours(hour, 0, 0, 0);
  return { bucket: at.toISOString(), course: "cs101", service: "lab", loType: null, views: 0, serviceTouches: 1, ...overrides };
}

function sessionRowAt(dayOffset: number, course: string, sessions: number): HourlySessionRow {
  const at = new Date(now.getTime());
  at.setDate(at.getDate() - dayOffset);
  at.setHours(9, 0, 0, 0);
  return { bucket: at.toISOString(), course, sessions };
}

describe("heat map kinds", () => {
  it("offers the three the API accepts", () => {
    expect([...HEATMAP_KINDS]).toEqual(["service", "service-monthly", "course"]);
    expect(isHeatmapKind("course")).toBe(true);
    expect(isHeatmapKind("weather")).toBe(false);
  });
});

describe("service usage by hour", () => {
  it("is a 7 by 24 grid with Monday first, filled in local time", () => {
    // 17 September 2026 is a Thursday: row 3 with Monday at 0.
    const matrix = serviceHourHeatmap([rowAt(0, 14, { serviceTouches: 5 }), rowAt(0, 14, { service: "pdf", serviceTouches: 2 })]);

    expect(matrix.y).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(matrix.x).toHaveLength(24);
    expect(matrix.cells).toHaveLength(7);
    expect(matrix.cells.every((row) => row.length === 24)).toBe(true);
    expect(matrix.cells[3][14]).toBe(7);
    expect(matrix.max).toBe(7);
    expect(matrix.scale).toBe("log");
  });

  it("ignores rows with no service, so views do not leak into a service map", () => {
    const matrix = serviceHourHeatmap([rowAt(0, 9, { service: null, loType: "lab", views: 40, serviceTouches: 0 })]);
    expect(matrix.max).toBe(0);
  });
});

describe("service usage by day", () => {
  it("gives every catalogued service a row, including the silent ones", () => {
    const range = rangeFor("7d", now);
    const matrix = serviceDayHeatmap(range, [rowAt(1, 10, { service: "lab", serviceTouches: 3 })]);

    expect(matrix.y).toEqual([...SERVICES]);
    expect(matrix.cells).toHaveLength(SERVICES.length);
    expect(matrix.cells[SERVICES.indexOf("lab")].reduce((total, value) => total + value, 0)).toBe(3);
    expect(matrix.cells[SERVICES.indexOf("archive")].every((value) => value === 0)).toBe(true);
    expect(matrix.x).toHaveLength(8);
  });
});

describe("course activity", () => {
  it("ranks courses by total sessions and caps the rows", () => {
    const range = rangeFor("7d", now);
    const matrix = courseActivityHeatmap(
      range,
      [sessionRowAt(1, "cs101", 4), sessionRowAt(2, "cs101", 6), sessionRowAt(1, "cs200", 3), sessionRowAt(1, "cs300", 1)],
      2
    );

    expect(matrix.y).toEqual(["cs101", "cs200"]);
    expect(matrix.cells[0].reduce((total, value) => total + value, 0)).toBe(10);
    expect(matrix.max).toBe(6);
    expect(matrix.scale).toBe("linear");
    expect(matrix.unit).toBe("sessions");
  });

  it("is empty, not ragged, when nothing happened", () => {
    const matrix = courseActivityHeatmap(rangeFor("today", now), []);
    expect(matrix.y).toEqual([]);
    expect(matrix.cells).toEqual([]);
    expect(matrix.max).toBe(0);
  });
});

describe("cell intensity", () => {
  it("is zero for an empty cell and one for the peak, on both scales", () => {
    expect(cellIntensity(0, 100, "linear")).toBe(0);
    expect(cellIntensity(100, 100, "linear")).toBe(1);
    expect(cellIntensity(0, 100, "log")).toBe(0);
    expect(cellIntensity(100, 100, "log")).toBe(1);
  });

  it("lifts the quiet end on a log scale, which is why the service map uses one", () => {
    expect(cellIntensity(1, 1000, "log")).toBeGreaterThan(cellIntensity(1, 1000, "linear"));
  });

  it("is zero rather than NaN when there is no peak to scale against", () => {
    expect(cellIntensity(0, 0, "log")).toBe(0);
  });
});
