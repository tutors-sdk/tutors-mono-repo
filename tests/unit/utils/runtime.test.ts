import { afterEach, describe, expect, it, vi } from "vitest";
import {
  announceClock,
  clockStatus,
  now,
  nowMs,
  versionEndpoint,
  versionInfo
} from "../../../packages/svelte/utils/runtime/src/index.ts";

const FROZEN = "2026-09-16T09:05:00.000Z";

describe("clock seam (HARNESS_NOW)", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.HARNESS_NOW;
  });

  it("answers the system clock when HARNESS_NOW is unset or blank", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-02T03:04:05.000Z"));
    expect(now({}).toISOString()).toBe("2030-01-02T03:04:05.000Z");
    expect(now({ HARNESS_NOW: "  " }).toISOString()).toBe("2030-01-02T03:04:05.000Z");
    expect(clockStatus({})).toEqual({ mode: "system" });
  });

  it("answers the frozen instant, every time, when HARNESS_NOW is an ISO instant", () => {
    const env = { HARNESS_NOW: FROZEN };
    expect(now(env).toISOString()).toBe(FROZEN);
    expect(nowMs(env)).toBe(Date.parse(FROZEN));
    expect(now(env).getTime()).toBe(now(env).getTime());
    expect(clockStatus(env)).toEqual({ mode: "frozen", instant: FROZEN });
  });

  it("normalises an offset instant to UTC", () => {
    expect(now({ HARNESS_NOW: "2026-09-16T10:05:00+01:00" }).toISOString()).toBe(FROZEN);
  });

  it("hands out a fresh Date each call, so a caller mutating one cannot move the clock", () => {
    const env = { HARNESS_NOW: FROZEN };
    now(env).setFullYear(1999);
    expect(now(env).toISOString()).toBe(FROZEN);
  });

  it.each(["yesterday", "1", "2026-09-16", "2026-09-16T09:05:00", "2026-13-45T99:99:99Z", "March 7, 2026"])(
    "rejects %j and keeps the system clock",
    (value) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2030-01-02T03:04:05.000Z"));
      expect(clockStatus({ HARNESS_NOW: value })).toEqual({ mode: "system", rejected: value });
      expect(now({ HARNESS_NOW: value }).toISOString()).toBe("2030-01-02T03:04:05.000Z");
    }
  );

  it("reads process.env at call time, not at import time", () => {
    process.env.HARNESS_NOW = FROZEN;
    expect(now().toISOString()).toBe(FROZEN);
    delete process.env.HARNESS_NOW;
    expect(clockStatus()).toEqual({ mode: "system" });
  });

  it("does not patch the global Date: code that never imports the seam (Auth.js expiry, log timestamps) keeps real time", () => {
    process.env.HARNESS_NOW = FROZEN;
    now();
    expect(Date.now()).not.toBe(Date.parse(FROZEN));
    expect(new Date().toISOString()).not.toBe(FROZEN);
  });

  describe("announceClock", () => {
    it("is silent on the system clock", () => {
      const warn = vi.fn();
      announceClock({ warn }, {});
      expect(warn).not.toHaveBeenCalled();
    });

    it("warns once, with the instant, when the clock is frozen", () => {
      const warn = vi.fn();
      announceClock({ warn }, { HARNESS_NOW: FROZEN });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/HARNESS_NOW.*FROZEN/);
      expect(warn.mock.calls[0][1]).toEqual({ frozenAt: FROZEN });
    });

    it("warns that an invalid value was ignored, quoting at most 64 characters of it", () => {
      const warn = vi.fn();
      announceClock({ warn }, { HARNESS_NOW: "x".repeat(500) });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/ignoring/);
      expect(warn.mock.calls[0][1]).toEqual({ value: "x".repeat(64) });
    });
  });
});

describe("GET /version", () => {
  it("answers the documented shape from the build's environment", async () => {
    const response = versionEndpoint({
      app: "tutors-reader",
      version: "16.2.2",
      env: { GIT_SHA: "790af8b", BUILD_DATE: "2026-09-19T12:00:00Z" }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      app: "tutors-reader",
      version: "16.2.2",
      revision: "790af8b",
      built: "2026-09-19T12:00:00Z",
      clock: "system"
    });
  });

  it("says unknown for a build that was given no revision or date", () => {
    expect(versionInfo({ app: "tutors-time", version: "1.0.0", env: { GIT_SHA: " " } })).toEqual({
      app: "tutors-time",
      version: "1.0.0",
      revision: "unknown",
      built: "unknown",
      clock: "system"
    });
  });

  it("shows a frozen clock, so a deployment running frozen by mistake is visible from outside", () => {
    expect(versionInfo({ app: "a", version: "1", env: { HARNESS_NOW: FROZEN } }).clock).toBe("frozen");
    expect(versionInfo({ app: "a", version: "1", env: { HARNESS_NOW: "nonsense" } }).clock).toBe("system");
  });
});
