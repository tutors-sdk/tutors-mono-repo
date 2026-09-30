import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { BaseCalendarModel } from "../../../../packages/jsr/time/src/services/base-calendar-model.ts";
import type { CalendarEntry, CalendarRow } from "../../../../packages/jsr/time/src/types/calendar-types.ts";
import { heatColor } from "../../../../packages/jsr/time/src/utils/calendar-utils.ts";
import { calendarEntries, calendarEntriesByStudent, cells, type TableRow } from "../../support/time.ts";

const feature = await loadFeature("tests/bdd/features/instructor/analytics-calendar.feature");

const list = (csv: string) => csv.split(",").map((item) => item.trim());

describeFeature(feature, ({ Scenario }) => {
  let entries: CalendarEntry[];
  let model: BaseCalendarModel;

  // Both views come from the one model the time app builds when the page loads.
  const build = () => {
    model = new BaseCalendarModel(entries, null);
  };

  /** Compare every row of a pivoted grid with the scenario's table: student, one cell per column, total. */
  const expectGrid = (rows: CalendarRow[], table: TableRow[]) => {
    const columns = Object.keys(table[0]).filter((column) => column !== "student" && column !== "total");
    const actual = rows.map((row) => ({ student: row.studentid, cells: cells(row, columns), total: row.totalSeconds }));
    const expected = table.map((row) => ({ student: row.student, cells: columns.map((column) => Number(row[column])), total: Number(row.total) }));
    expect(actual).toEqual(expected);
  };

  Scenario("View calendar activity by day", ({ Given, When, Then, And }) => {
    Given("the calendar holds these entries:", (_ctx, table: TableRow[]) => {
      entries = calendarEntries(table);
    });
    When("an instructor opens the calendar analytics view", build);
    Then("the day grid shall have one row per student, in the order {string}", (_ctx, students: string) => {
      expect(model.day.rows.map((row) => row.studentid)).toEqual(list(students));
    });
    And("each day column shall represent a distinct date, in the order {string}", (_ctx, dates: string) => {
      expect(model.dates).toEqual(list(dates));
    });
    And("the day grid cells shall show time active in minutes:", (_ctx, table: TableRow[]) => {
      expectGrid(model.day.rows, table);
    });
  });

  Scenario("View calendar activity by week", ({ Given, When, Then, And }) => {
    Given("the calendar holds these entries:", (_ctx, table: TableRow[]) => {
      entries = calendarEntries(table);
    });
    When("an instructor switches to the week view", build);
    Then("each week column shall be labelled by its Monday date, in the order {string}", (_ctx, mondays: string) => {
      expect(model.weeks).toEqual(list(mondays));
    });
    And("the week grid shall aggregate daily activity into weekly columns:", (_ctx, table: TableRow[]) => {
      expectGrid(model.week.rows, table);
    });
  });

  Scenario("Calculate median activity per day", ({ Given, When, Then, And }) => {
    Given("the calendar holds minutes active per student per day:", (_ctx, table: TableRow[]) => {
      entries = calendarEntriesByStudent(table);
    });
    When("an instructor opens the calendar analytics view", build);
    Then("the daily median row shall show the middle value across the students active each day:", (_ctx, table: TableRow[]) => {
      const dates = Object.keys(table[0]);
      expect(model.dates).toEqual(dates);
      expect(cells(model.medianByDay.row, dates)).toEqual(dates.map((date) => Number(table[0][date])));
    });
    And("the daily median total shall be {number}, the middle of the students' totals", (_ctx, total: number) => {
      expect(model.medianByDay.row?.totalSeconds).toBe(total);
    });
  });

  Scenario("Calculate median activity per week", ({ Given, When, Then, And }) => {
    Given("the calendar holds minutes active per student per day:", (_ctx, table: TableRow[]) => {
      entries = calendarEntriesByStudent(table);
    });
    When("an instructor switches to the week view", build);
    Then("the weekly median row shall sum the daily medians within each week:", (_ctx, table: TableRow[]) => {
      const mondays = Object.keys(table[0]);
      expect(model.weeks).toEqual(mondays);
      expect(cells(model.medianByWeek.row, mondays)).toEqual(mondays.map((monday) => Number(table[0][monday])));
    });
    And("the weekly median total shall be {number}, the median of all weekly sums", (_ctx, total: number) => {
      expect(model.medianByWeek.row?.totalSeconds).toBe(total);
    });
  });

  Scenario("Colour code activity cells", ({ When, Then, And }) => {
    const colours = new Map<number, string>();
    const tint = (token: string) => (_ctx: unknown, minutes: number, percent: number) => {
      expect(colours.get(minutes)).toBe(`color-mix(in srgb, var(--ui-${token}) ${percent}%, var(--ui-surface))`);
    };

    When("the calendar grid colours cells holding these minutes of activity:", (_ctx, table: TableRow[]) => {
      for (const row of table) colours.set(Number(row.minutes), heatColor(Number(row.minutes)));
    });
    Then("a cell with {number} minutes shall have no heat colour", (_ctx, minutes: number) => {
      expect(colours.get(minutes)).toBe("");
    });
    And("a cell with {number} minutes shall be the lightest success tint, {number}% over the surface", tint("success"));
    And("a cell with {number} minutes shall be the deepest success tint, {number}% over the surface", tint("success"));
    And("a cell with {number} minutes shall be a danger tint, {number}% over the surface", tint("danger"));
    And("a cell with {number} minutes shall be the deepest danger tint, {number}% over the surface", tint("danger"));
    And("a cell with {number} minutes shall stay the deepest danger tint, {number}% over the surface", tint("danger"));
  });

  Scenario("Handle empty calendar data", ({ Given, When, Then, And }) => {
    Given("no calendar entries exist for a course", () => {
      entries = [];
    });
    When("an instructor opens the calendar analytics view", build);
    Then("the day grid and the week grid shall have {number} rows", (_ctx, count: number) => {
      expect(model.day.rows).toHaveLength(count);
      expect(model.week.rows).toHaveLength(count);
    });
    And("the calendar shall have {number} day columns and {number} week columns", (_ctx, days: number, weeks: number) => {
      expect(model.dates).toHaveLength(days);
      expect(model.weeks).toHaveLength(weeks);
    });
    And("no daily or weekly median row shall be produced", () => {
      // The grids check `row != null` before drawing a median, so an empty course shows none.
      expect(model.medianByDay.row).toBeNull();
      expect(model.medianByWeek.row).toBeNull();
    });
  });
});
