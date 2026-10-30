import { describe, it, expect, vi } from "vitest";

// i18n reads its locale from a rune; the stub stands in for Svelte's compiler.
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../bdd/support/runes-stub.ts"));

import { courseTimeHref, describeDateRange, rangeOf, readDateRange, withDateRange } from "../../../apps/time/src/lib/dateRange.ts";
import { load as courseRedirect } from "../../../apps/time/src/routes/[courseid]/+page.ts";
import { load as calendarRedirect } from "../../../apps/time/src/routes/[courseid]/(calendar-lab)/calendar/+page.ts";
import { load as labRedirect } from "../../../apps/time/src/routes/[courseid]/(calendar-lab)/lab/+page.ts";

// Issue #526: the reporting period lives in the address, so every route and link in Tutors Time
// must read it from there and carry it on. Rule 0655 and 0656 prove the loaders; this file pins
// the address helpers and the redirects between views.

const search = (query: string) => new URLSearchParams(query);

/** The 400 SvelteKit shows for a refused period. */
const refusal = (message: string) => expect.objectContaining({ status: 400, body: expect.objectContaining({ message }) });

/** The Location of the redirect a load throws. */
function redirectedTo(load: () => unknown): string {
  try {
    load();
  } catch (e) {
    return (e as { location: string }).location;
  }
  throw new Error("load did not redirect");
}

describe("readDateRange", () => {
  it("leaves both bounds open when the address has no dates", () => {
    expect(readDateRange(search(""))).toEqual({ startDate: null, endDate: null });
    expect(readDateRange(search("start=&end=%20"))).toEqual({ startDate: null, endDate: null });
  });

  it("reads one bound alone, leaving the other open", () => {
    expect(readDateRange(search("start=2025-01-06"))).toEqual({ startDate: "2025-01-06", endDate: null });
    expect(readDateRange(search("end=2025-01-12"))).toEqual({ startDate: null, endDate: "2025-01-12" });
  });

  it("reads both bounds, a single day included", () => {
    expect(readDateRange(search("start=2025-01-06&end=2025-01-12"))).toEqual({ startDate: "2025-01-06", endDate: "2025-01-12" });
    expect(readDateRange(search("start=2025-01-06&end=2025-01-06"))).toEqual({ startDate: "2025-01-06", endDate: "2025-01-06" });
  });

  it("accepts a leap day and refuses a day the calendar does not have", () => {
    expect(readDateRange(search("start=2024-02-29")).startDate).toBe("2024-02-29");
    expect(() => readDateRange(search("start=2025-02-29"))).toThrow(refusal("Dates must be calendar dates written as YYYY-MM-DD"));
  });

  it.each(["2025-1-6", "06/01/2025", "2025-13-01", "today", "2025-01-06T00:00:00Z"])("refuses the malformed date %s", (date) => {
    expect(() => readDateRange(search(`end=${encodeURIComponent(date)}`))).toThrow(refusal("Dates must be calendar dates written as YYYY-MM-DD"));
  });

  it("refuses a start after the end instead of swapping or widening the period", () => {
    expect(() => readDateRange(search("start=2025-01-12&end=2025-01-06"))).toThrow(refusal("Start date must be before or equal to end date"));
  });
});

describe("Time addresses carry the reporting period", () => {
  it("opens a course on its medians view with the chosen period", () => {
    expect(courseTimeHref("web-1", { startDate: "2025-01-06", endDate: "2025-01-12" })).toBe("/web-1/medians?start=2025-01-06&end=2025-01-12");
    expect(courseTimeHref("web-1", { startDate: null, endDate: "2025-01-12" })).toBe("/web-1/medians?end=2025-01-12");
    expect(courseTimeHref("web-1", { startDate: null, endDate: null })).toBe("/web-1/medians");
  });

  it("keeps only the period when linking from one view to another", () => {
    expect(withDateRange("/web-1/lab/bylab", "?start=2025-01-06&end=2025-01-12&tab=2")).toBe("/web-1/lab/bylab?start=2025-01-06&end=2025-01-12");
    expect(withDateRange("/web-1/octocat", "?end=2025-01-12")).toBe("/web-1/octocat?end=2025-01-12");
    expect(withDateRange("/web-1/medians", "")).toBe("/web-1/medians");
  });

  it("describes the period a page shows, with an open bound as an ellipsis", () => {
    expect(describeDateRange("?start=2025-01-06&end=2025-01-12")).toBe("2025-01-06 – 2025-01-12");
    expect(describeDateRange("?start=2025-01-06")).toBe("2025-01-06 – …");
    expect(describeDateRange("?end=2025-01-12")).toBe("… – 2025-01-12");
    expect(describeDateRange("")).toBeNull();
  });

  it("hands tables the period of the page they sit on", () => {
    expect(rangeOf("?start=2025-01-06")).toEqual({ startDate: "2025-01-06", endDate: null });
  });

  it("keeps the period through the course, calendar and lab redirects", () => {
    const url = new URL("https://time.example.org/web-1?start=2025-01-06&end=2025-01-12");
    const params = { courseid: "web-1" };
    expect(redirectedTo(() => courseRedirect({ params, url } as never))).toBe("/web-1/medians?start=2025-01-06&end=2025-01-12");
    expect(redirectedTo(() => calendarRedirect({ params, url } as never))).toBe("/web-1/calendar/byweek?start=2025-01-06&end=2025-01-12");
    expect(redirectedTo(() => labRedirect({ params, url } as never))).toBe("/web-1/lab/bylab?start=2025-01-06&end=2025-01-12");
  });
});
