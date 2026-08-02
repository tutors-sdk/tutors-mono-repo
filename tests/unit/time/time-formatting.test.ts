import { describe, it, expect } from "vitest";
import {
  formatDateShort,
  formatTimeNearestMinute,
  formatTimeMinutesOnly
} from "../../../packages/jsr/time/src/utils/calendar-utils";

// ===========================================================================
// formatDateShort edge dates
// ===========================================================================
describe("formatDateShort edge dates", () => {
  it("formats January 1st correctly", () => {
    expect(formatDateShort("2025-01-01")).toBe("1/1/25");
  });

  it("formats December 31st correctly", () => {
    expect(formatDateShort("2025-12-31")).toBe("31/12/25");
  });

  it("formats Feb 29 in a leap year (2024)", () => {
    expect(formatDateShort("2024-02-29")).toBe("29/2/24");
  });

  it("formats a date in year 2000 with two-digit year 00", () => {
    expect(formatDateShort("2000-06-15")).toBe("15/6/00");
  });

  it("formats last day of February in a non-leap year", () => {
    expect(formatDateShort("2025-02-28")).toBe("28/2/25");
  });
});

// ===========================================================================
// formatTimeNearestMinute fractional and boundary values
// ===========================================================================
describe("formatTimeNearestMinute fractional and boundary values", () => {
  it("rounds 59.6 up to 60 minutes which formats as 1h 0", () => {
    expect(formatTimeNearestMinute(59.6)).toBe("1h 0");
  });

  it("rounds 59.4 down to 59 minutes", () => {
    expect(formatTimeNearestMinute(59.4)).toBe("59");
  });

  it("rounds 0.4 down to 0", () => {
    expect(formatTimeNearestMinute(0.4)).toBe("0");
  });

  it("rounds 0.5 up to 1", () => {
    expect(formatTimeNearestMinute(0.5)).toBe("1");
  });

  it("formats exactly 1 minute as '1'", () => {
    expect(formatTimeNearestMinute(1)).toBe("1");
  });

  it("formats large value 1440 minutes as 24h 0", () => {
    expect(formatTimeNearestMinute(1440)).toBe("24h 0");
  });

  it("formats 121.7 as 2h 2 (rounds to 122, then 2h 2)", () => {
    expect(formatTimeNearestMinute(121.7)).toBe("2h 2");
  });
});

// ===========================================================================
// formatTimeMinutesOnly additional cases
// ===========================================================================
describe("formatTimeMinutesOnly additional cases", () => {
  it("formats large value 1440 as '1440'", () => {
    expect(formatTimeMinutesOnly(1440)).toBe("1440");
  });

  it("formats 1 as '1'", () => {
    expect(formatTimeMinutesOnly(1)).toBe("1");
  });

  it("rounds fractional 45.6 to '46'", () => {
    expect(formatTimeMinutesOnly(45.6)).toBe("46");
  });

  it("rounds fractional 45.4 to '45'", () => {
    expect(formatTimeMinutesOnly(45.4)).toBe("45");
  });

  it("formats very large value 10000 as '10000'", () => {
    expect(formatTimeMinutesOnly(10000)).toBe("10000");
  });
});
