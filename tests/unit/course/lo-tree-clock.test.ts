import { afterEach, describe, expect, it, vi } from "vitest";
import type { Course, Lo } from "../../../packages/jsr/model/src/tutors.ts";
import { decorateCourseTree } from "../../../packages/svelte/course/src/course/services/lo-tree.ts";

// `rune()` wraps a value in `$state`, which needs the Svelte compiler; the tree only reads `.value`.
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(value: T) => ({ value });
  return { rune, courseProtocol: rune("https://") };
});
vi.mock("@tutors/themes", () => ({ themeService: { addIcon: () => undefined } }));

function course(): Course {
  const lo = { type: "course", title: "course", route: "/", contentMd: "# course", summary: "", los: [] as Lo[] } as unknown as Course;
  lo.properties = {};
  lo.calendar = {
    title: "Semester 1",
    weeks: [
      { date: "2026-09-07", week: 1, topic: "Week One" },
      { date: "2026-09-14", week: 2, topic: "Week Two" },
      { date: "2026-09-21", week: 3, topic: "Week Three" },
      { date: "2026-09-28", week: 4, topic: "Week Four" }
    ]
  } as unknown as Course["calendar"];
  return lo;
}

/** The reader server renders the current week into every course page; it must follow the seam's clock. */
describe("decorateCourseTree: current calendar week follows the server clock seam", () => {
  afterEach(() => {
    delete process.env.HARNESS_NOW;
    vi.useRealTimers();
  });

  it("answers the week of HARNESS_NOW when it is set, whatever the system clock says", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T00:00:00Z"));
    process.env.HARNESS_NOW = "2026-09-16T09:05:00.000Z";
    const c = course();
    decorateCourseTree(c, "cs101", "cs101.netlify.app");
    expect(c.courseCalendar?.currentWeek?.title).toBe("Week Two");
  });

  it("answers the week of the system clock when HARNESS_NOW is unset, so production is unchanged", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
    const c = course();
    decorateCourseTree(c, "cs101", "cs101.netlify.app");
    expect(c.courseCalendar?.currentWeek?.title).toBe("Week Three");
  });
});
