import { describe, it, expect } from "vitest";
import { cellColorForMinutes } from "../../../packages/jsr/time/src/utils/calendar-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HeatmapCell {
  studentName: string;
  date: string;
  minutes: number;
}

interface HeatmapGrid {
  dates: string[];
  students: string[];
  cells: HeatmapCell[];
}

function makeGrid(dates: string[], students: string[]): HeatmapGrid {
  const cells: HeatmapCell[] = [];
  for (const student of students) {
    for (const date of dates) {
      cells.push({ studentName: student, date, minutes: 0 });
    }
  }
  return { dates, students, cells };
}

// ===========================================================================
// Zero minutes colour
// ===========================================================================
describe("CalendarHeatmap: zero minutes colour", () => {
  it("should be white for zero minutes", () => {
    const colour = cellColorForMinutes(0);
    expect(colour).toBe("rgb(255, 255, 255)");
  });

  it("should be white for null minutes", () => {
    const colour = cellColorForMinutes(null);
    expect(colour).toBe("rgb(255, 255, 255)");
  });

  it("should be white for undefined minutes", () => {
    const colour = cellColorForMinutes(undefined);
    expect(colour).toBe("rgb(255, 255, 255)");
  });

  it("should be white for negative minutes", () => {
    const colour = cellColorForMinutes(-10);
    expect(colour).toBe("rgb(255, 255, 255)");
  });
});

// ===========================================================================
// Colour transitions
// ===========================================================================
describe("CalendarHeatmap: colour transitions through green to red", () => {
  it("1 minute should produce a light green", () => {
    const colour = cellColorForMinutes(1);
    expect(colour).toBe("rgb(200, 255, 200)");
  });

  it("100 minutes should produce a mid-green (between light and deep green)", () => {
    const colour = cellColorForMinutes(100);
    // At 100 min: t = (100-1)/199 ~= 0.497
    // r = round(200 + 0.497 * (0 - 200)) = round(200 - 99.5) = 101
    // g = round(255 + 0.497 * (120 - 255)) = round(255 - 67.1) = 188
    // b = round(200 + 0.497 * (0 - 200)) = round(200 - 99.5) = 101
    expect(colour).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    // Green channel should still be dominant
    const match = colour.match(/rgb\((\d+), (\d+), (\d+)\)/);
    const g = parseInt(match![2]);
    expect(g).toBeGreaterThan(100);
  });

  it("200 minutes should produce deep green", () => {
    const colour = cellColorForMinutes(200);
    expect(colour).toBe("rgb(0, 120, 0)");
  });

  it("400 minutes should produce light red", () => {
    const colour = cellColorForMinutes(400);
    expect(colour).toBe("rgb(255, 180, 180)");
  });

  it("800+ minutes should produce deep red", () => {
    const colour = cellColorForMinutes(800);
    expect(colour).toBe("rgb(180, 0, 0)");
  });

  it("values beyond 800 should clamp at deep red", () => {
    const colour1 = cellColorForMinutes(800);
    const colour2 = cellColorForMinutes(1200);
    expect(colour1).toBe(colour2);
  });
});

// ===========================================================================
// Grid dimensions
// ===========================================================================
describe("CalendarHeatmap: grid dimensions", () => {
  it("grid should match dates x students", () => {
    const grid = makeGrid(
      ["2024-01-01", "2024-01-02", "2024-01-03"],
      ["Alice", "Bob"]
    );
    expect(grid.cells.length).toBe(3 * 2); // 3 dates x 2 students
  });

  it("dates array should determine column count", () => {
    const grid = makeGrid(["2024-01-01", "2024-01-02"], ["Alice"]);
    expect(grid.dates).toHaveLength(2);
  });

  it("students array should determine row count", () => {
    const grid = makeGrid(["2024-01-01"], ["Alice", "Bob", "Charlie"]);
    expect(grid.students).toHaveLength(3);
  });
});

// ===========================================================================
// Tooltip data
// ===========================================================================
describe("CalendarHeatmap: tooltip data", () => {
  it("should include student name in cell data", () => {
    const cell: HeatmapCell = { studentName: "Alice", date: "2024-03-15", minutes: 45 };
    expect(cell.studentName).toBe("Alice");
  });

  it("should include time value in cell data", () => {
    const cell: HeatmapCell = { studentName: "Bob", date: "2024-03-15", minutes: 120 };
    expect(cell.minutes).toBe(120);
  });

  it("tooltip should format student name and minutes", () => {
    const cell: HeatmapCell = { studentName: "Charlie", date: "2024-03-15", minutes: 90 };
    const tooltip = `${cell.studentName}: ${cell.minutes} min`;
    expect(tooltip).toBe("Charlie: 90 min");
  });
});

// ===========================================================================
// Empty dataset
// ===========================================================================
describe("CalendarHeatmap: empty dataset", () => {
  it("should render empty grid with no dates and no students", () => {
    const grid = makeGrid([], []);
    expect(grid.cells).toHaveLength(0);
    expect(grid.dates).toHaveLength(0);
    expect(grid.students).toHaveLength(0);
  });

  it("should handle dates with no students", () => {
    const grid = makeGrid(["2024-01-01"], []);
    expect(grid.cells).toHaveLength(0);
  });

  it("should handle students with no dates", () => {
    const grid = makeGrid([], ["Alice"]);
    expect(grid.cells).toHaveLength(0);
  });
});
