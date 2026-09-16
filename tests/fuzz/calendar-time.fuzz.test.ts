/**
 * Property tests for time aggregation (runway tier B), run against the real
 * `packages/jsr/time` code. Timezone bugs live here, so `pnpm test:tz` runs
 * this file (and the rest of the time tests) under UTC, Europe/Dublin and
 * Pacific/Auckland; the dates below deliberately cluster on week, year and
 * daylight-saving boundaries in those zones.
 *
 * Replay a failure: FUZZ_SEED=<seed> FUZZ_PATH=<path> pnpm test:fuzz
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BaseCalendarModel } from "../../packages/jsr/time/src/services/base-calendar-model.ts";
import { formatDateShort, getMondayForDate } from "../../packages/jsr/time/src/utils/calendar-utils.ts";
import type { CalendarEntry, CalendarModel } from "../../packages/jsr/time/src/types/index.ts";
import { fuzzParameters } from "../support/arbitraries/course-tree.ts";

type BuildModel = (entries: CalendarEntry[]) => CalendarModel;
type MondayOf = (date: string) => string;
type FormatShort = (date: string) => string;

const DAY_MS = 86_400_000;
const EPOCH_START = Date.UTC(2019, 11, 20);
const EPOCH_END = Date.UTC(2031, 0, 10);

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Dates where local-time arithmetic goes wrong: DST switches in Dublin and Auckland, and year ends. */
const BOUNDARY_DATES = [
  "2025-03-30", "2025-03-31", "2025-10-26", "2025-10-27", // Europe/Dublin
  "2025-04-06", "2025-04-07", "2025-09-28", "2025-09-29", // Pacific/Auckland
  "2025-12-28", "2025-12-29", "2026-01-01", "2026-01-04", "2024-02-29", "2024-03-03"
];

export const dateArbitrary: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: (EPOCH_END - EPOCH_START) / DAY_MS }).map((d) => isoDay(EPOCH_START + d * DAY_MS)) },
  { weight: 1, arbitrary: fc.constantFrom(...BOUNDARY_DATES) }
);

export const entryArbitrary: fc.Arbitrary<CalendarEntry> = fc.record({
  id: dateArbitrary,
  studentid: fc.constantFrom("ada", "brendan", "ciara", "dmitri", "eimear"),
  courseid: fc.constant("cs101"),
  timeactive: fc.integer({ min: 0, max: 600 }),
  pageloads: fc.nat({ max: 50 }),
  full_name: fc.constant("")
});

const entries = fc.array(entryArbitrary, { maxLength: 60 });

/** Day of the week from the calendar date alone, independent of the process timezone. 0 = Sunday. */
const utcDayOfWeek = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function fail(message: string): never {
  throw new Error(message);
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export const timeProperties = {
  /** The Monday of a date's week is a Monday, on or before the date, at most six days earlier. */
  mondayOfWeek: (mondayOf: MondayOf) =>
    fc.property(dateArbitrary, (date) => {
      const monday = mondayOf(date);
      if (utcDayOfWeek(monday) !== 1) fail(`${monday} (for ${date}) is not a Monday`);
      const gap = daysBetween(monday, date);
      if (gap < 0 || gap > 6) fail(`${monday} is ${gap} days from ${date}`);
    }),

  /** Short dates are the calendar date as written, whatever the process timezone. */
  shortDateIsCalendarDate: (format: FormatShort) =>
    fc.property(dateArbitrary, (date) => {
      const [y, m, d] = date.split("-").map(Number);
      const expected = `${d}/${m}/${String(y % 100).padStart(2, "0")}`;
      const actual = format(date);
      if (actual !== expected) fail(`${date} formatted as ${actual}, expected ${expected}`);
    }),

  /** Time is conserved: per student, day view, week view and raw entries agree, however the days fall across weeks. */
  timeConservedAcrossWeeks: (build: BuildModel) =>
    fc.property(entries, (list) => {
      const model = build(list);
      const students = [...new Set(list.map((e) => e.studentid))];
      for (const student of students) {
        const raw = sum(list.filter((e) => e.studentid === student).map((e) => e.timeactive));
        const day = model.day.rows.find((r) => r.studentid === student) ?? fail(`no day row for ${student}`);
        const week = model.week.rows.find((r) => r.studentid === student) ?? fail(`no week row for ${student}`);
        const dayColumns = sum(model.dates.map((d) => Number(day[d] ?? 0)));
        const weekColumns = sum(model.weeks.map((w) => Number(week[w] ?? 0)));
        if (day.totalSeconds !== raw || week.totalSeconds !== raw || dayColumns !== raw || weekColumns !== raw) {
          fail(`${student}: entries ${raw}, day total ${day.totalSeconds} (columns ${dayColumns}), week total ${week.totalSeconds} (columns ${weekColumns})`);
        }
      }
    }),

  /** Every entry's week is a column, and columns are sorted and distinct. */
  weeksCoverEntries: (build: BuildModel) =>
    fc.property(entries, (list) => {
      const model = build(list);
      const sorted = [...new Set(model.weeks)].sort();
      if (sorted.join() !== model.weeks.join()) fail(`weeks are not sorted and distinct: ${model.weeks.join(", ")}`);
      for (const entry of list) {
        const monday = getMondayForDate(entry.id);
        if (!model.weeks.includes(monday)) fail(`week ${monday} of ${entry.id} is not a column`);
      }
    }),

  /** Weekly medians redistribute daily medians without losing or inventing time. */
  weeklyMediansSumDailyMedians: (build: BuildModel) =>
    fc.property(entries, (list) => {
      const model = build(list);
      const byDay = model.medianByDay.row;
      const byWeek = model.medianByWeek.row;
      if (!byDay || !byWeek) {
        if (list.length > 0) fail("median rows missing for non-empty entries");
        return;
      }
      const daily = sum(model.dates.map((d) => Number(byDay[d] ?? 0)));
      const weekly = sum(model.weeks.map((w) => Number(byWeek[w] ?? 0)));
      if (daily !== weekly) fail(`daily medians sum to ${daily}, weekly to ${weekly}`);
    })
};

const realModel: BuildModel = (list) => new BaseCalendarModel(list, null);

describe("time aggregation properties (runway tier B)", () => {
  it("runs in the timezone the matrix asked for", () => {
    // Set by scripts/checks/tz-matrix.ts. Checked against what the runtime resolved, because a
    // shell that drops TZ would otherwise run every zone of the matrix as the host zone.
    const requested = process.env.TZ_MATRIX_ZONE ?? process.env.TZ;
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (requested) expect(resolved).toBe(requested);
    else expect(resolved.length).toBeGreaterThan(0);
  });

  it("getMondayForDate: mondayOfWeek", () => {
    fc.assert(timeProperties.mondayOfWeek(getMondayForDate), fuzzParameters(500));
  });

  it("formatDateShort: shortDateIsCalendarDate", () => {
    fc.assert(timeProperties.shortDateIsCalendarDate(formatDateShort), fuzzParameters(500));
  });

  it.each(["timeConservedAcrossWeeks", "weeksCoverEntries", "weeklyMediansSumDailyMedians"] as const)("BaseCalendarModel: %s", (name) => {
    fc.assert(timeProperties[name](realModel), fuzzParameters(200));
  });
});

describe("time aggregation properties: negative fixtures", () => {
  const FIXED = { seed: 20260916, numRuns: 300 };

  function expectCounterexample(property: fc.IProperty<unknown>) {
    const details = fc.check(property, FIXED);
    expect(details.failed, "the broken implementation passed; the property cannot fail").toBe(true);
    expect(fc.defaultReportMessage(details) ?? "").toMatch(/seed: 20260916, path: "[\d:]+"/);
  }

  const isSunday = (date: string) => utcDayOfWeek(date) === 0;

  it("mondayOfWeek fails for weeks that start on Sunday", () => {
    const sundayStart: MondayOf = (date) => (isSunday(date) ? getMondayForDate(isoDay(Date.parse(`${date}T00:00:00Z`) + DAY_MS)) : getMondayForDate(date));
    expectCounterexample(timeProperties.mondayOfWeek(sundayStart));
  });

  it("shortDateIsCalendarDate fails when day and month swap", () => {
    const monthFirst: FormatShort = (date) => formatDateShort(date).replace(/^(\d+)\/(\d+)/, "$2/$1");
    expectCounterexample(timeProperties.shortDateIsCalendarDate(monthFirst));
  });

  it("timeConservedAcrossWeeks fails when Sunday time falls out of the week view", () => {
    const dropsSundays: BuildModel = (list) => {
      const full = new BaseCalendarModel(list, null);
      return { ...full, week: new BaseCalendarModel(list.filter((e) => !isSunday(e.id)), null).week };
    };
    expectCounterexample(timeProperties.timeConservedAcrossWeeks(dropsSundays));
  });

  it("weeksCoverEntries fails when a week column is missing", () => {
    const dropsFirstWeek: BuildModel = (list) => {
      const full = new BaseCalendarModel(list, null);
      return { ...full, weeks: full.weeks.slice(1) };
    };
    expectCounterexample(timeProperties.weeksCoverEntries(dropsFirstWeek));
  });

  it("weeklyMediansSumDailyMedians fails when a week's medians are lost", () => {
    const losesWeek: BuildModel = (list) => {
      const full = new BaseCalendarModel(list, null);
      const row = full.medianByWeek.row ? { ...full.medianByWeek.row, [full.weeks[0]]: 0 } : null;
      return { ...full, medianByWeek: { row } };
    };
    expectCounterexample(timeProperties.weeklyMediansSumDailyMedians(losesWeek));
  });
});
