import { describe, expect, it } from "vitest";
import { SERVICES } from "@tutors/live-events";
import { OBSERVATION_KINDS, observe, sessionsByCourseDay, type HourlyRow, type HourlySessionRow } from "@tutors/live-store";

/**
 * The observation rules, fired on synthetic data.
 *
 * Each rule is checked twice: once on the shape that should raise a card, and
 * once on the shape that should not - a rule that fires on everything is worth
 * less than no rule at all.
 */

const now = new Date(2026, 8, 17, 18, 0);

/** A session rollup `dayOffset` days before now. */
function sessionsOn(dayOffset: number, course: string, sessions: number): HourlySessionRow {
  const at = new Date(now.getTime());
  at.setDate(at.getDate() - dayOffset);
  at.setHours(10, 0, 0, 0);
  return { bucket: at.toISOString(), course, sessions };
}

/** A service rollup `dayOffset` days before now. */
function touchesOn(dayOffset: number, service: string, serviceTouches = 1): HourlyRow {
  const at = new Date(now.getTime());
  at.setDate(at.getDate() - dayOffset);
  at.setHours(10, 0, 0, 0);
  return { bucket: at.toISOString(), course: "cs101", service, loType: null, views: 0, serviceTouches };
}

/** Every catalogued service touched recently, so the silent-service rule stays quiet. */
const everyServiceTouched = SERVICES.map((service) => touchesOn(1, service));

/** The four same weekdays before today, each with the same baseline. */
function fourQuietWeeks(course: string, sessions: number): HourlySessionRow[] {
  return [7, 14, 21, 28].map((offset) => sessionsOn(offset, course, sessions));
}

describe("observation rules", () => {
  it("names the four kinds the plan asks for", () => {
    expect([...OBSERVATION_KINDS]).toEqual(["spike", "silent-service", "out-of-term", "drop-off"]);
  });

  describe("spike", () => {
    it("fires when today beats three times the four-week same-weekday median", () => {
      const observations = observe({
        hourlySessions: [...fourQuietWeeks("cs101", 10), sessionsOn(0, "cs101", 40)],
        hourly: everyServiceTouched,
        now
      });

      const spike = observations.find((observation) => observation.kind === "spike");
      expect(spike).toMatchObject({ course: "cs101", severity: "info", id: "spike:cs101:2026-09-17" });
      expect(spike?.detail).toContain("40 sessions today");
      expect(spike?.detail).toContain("median of 10");
    });

    it("stays quiet at three times exactly, and on a course with no history", () => {
      const onTheLine = observe({
        hourlySessions: [...fourQuietWeeks("cs101", 10), sessionsOn(0, "cs101", 30)],
        hourly: everyServiceTouched,
        now
      });
      expect(onTheLine.filter((observation) => observation.kind === "spike")).toEqual([]);

      const brandNew = observe({ hourlySessions: [sessionsOn(0, "cs999", 500)], hourly: everyServiceTouched, now });
      expect(brandNew.filter((observation) => observation.kind === "spike")).toEqual([]);
    });

    it("ignores a course that is busy only by the standards of a course nobody uses", () => {
      const observations = observe({
        hourlySessions: [...fourQuietWeeks("cs101", 1), sessionsOn(0, "cs101", 4)],
        hourly: everyServiceTouched,
        now
      });
      expect(observations.filter((observation) => observation.kind === "spike")).toEqual([]);
    });
  });

  describe("silent service", () => {
    it("names every catalogued service with no touches in the window", () => {
      const observations = observe({
        hourlySessions: [],
        hourly: [touchesOn(1, "lab"), touchesOn(2, "reader")],
        now,
        options: { silentServiceDays: 7 }
      });

      const silent = observations.filter((observation) => observation.kind === "silent-service").map((observation) => observation.service);
      expect(silent).not.toContain("lab");
      expect(silent).not.toContain("reader");
      expect(silent).toContain("archive");
      expect(silent).toHaveLength(SERVICES.length - 2);
      expect(observations.find((observation) => observation.kind === "silent-service")?.severity).toBe("warning");
    });

    it("does not count a touch that is older than the window", () => {
      const observations = observe({
        hourlySessions: [],
        hourly: [touchesOn(30, "lab")],
        now,
        options: { silentServiceDays: 7 }
      });
      expect(observations.map((observation) => observation.service)).toContain("lab");
    });
  });

  describe("drop-off", () => {
    it("fires when a course loses more than 60% week on week", () => {
      const lastWeek = [7, 8, 9, 10].map((offset) => sessionsOn(offset, "cs101", 25));
      const thisWeek = [1, 2].map((offset) => sessionsOn(offset, "cs101", 5));

      const observations = observe({ hourlySessions: [...lastWeek, ...thisWeek], hourly: everyServiceTouched, now });
      const drop = observations.find((observation) => observation.kind === "drop-off");

      expect(drop).toMatchObject({ course: "cs101", severity: "warning" });
      expect(drop?.detail).toContain("10 sessions this week against 100 last week");
      expect(drop?.detail).toContain("90%");
    });

    it("stays quiet on a course that was too small for the fall to mean anything", () => {
      const observations = observe({
        hourlySessions: [sessionsOn(8, "cs101", 5), sessionsOn(1, "cs101", 0)],
        hourly: everyServiceTouched,
        now
      });
      expect(observations.filter((observation) => observation.kind === "drop-off")).toEqual([]);
    });
  });

  describe("out of term", () => {
    const terms = [{ name: "Semester 1", from: "2026-10-05", to: "2026-12-18" }];

    it("fires on activity outside every configured window", () => {
      const observations = observe({
        hourlySessions: [sessionsOn(1, "cs101", 30)],
        hourly: everyServiceTouched,
        now,
        options: { terms }
      });

      const outOfTerm = observations.find((observation) => observation.kind === "out-of-term");
      expect(outOfTerm).toMatchObject({ course: "cs101", severity: "info" });
      expect(outOfTerm?.detail).toContain("30 sessions");
    });

    it("stays quiet inside a window, below the threshold, and with no windows configured", () => {
      const inTerm = observe({
        hourlySessions: [sessionsOn(1, "cs101", 30)],
        hourly: everyServiceTouched,
        now,
        options: { terms: [{ name: "Semester 1", from: "2026-09-07", to: "2026-12-18" }] }
      });
      expect(inTerm.filter((observation) => observation.kind === "out-of-term")).toEqual([]);

      const quiet = observe({ hourlySessions: [sessionsOn(1, "cs101", 2)], hourly: everyServiceTouched, now, options: { terms } });
      expect(quiet.filter((observation) => observation.kind === "out-of-term")).toEqual([]);

      const unconfigured = observe({ hourlySessions: [sessionsOn(1, "cs101", 30)], hourly: everyServiceTouched, now });
      expect(unconfigured.filter((observation) => observation.kind === "out-of-term")).toEqual([]);
    });

    it("respects a window that covers only some courses", () => {
      const scoped = [{ name: "Semester 1", from: "2026-09-07", to: "2026-12-18", courses: ["cs101"] }];
      const observations = observe({
        hourlySessions: [sessionsOn(1, "cs101", 30), sessionsOn(1, "cs200", 30)],
        hourly: everyServiceTouched,
        now,
        options: { terms: scoped }
      });
      expect(observations.filter((observation) => observation.kind === "out-of-term").map((observation) => observation.course)).toEqual([
        "cs200"
      ]);
    });
  });

  it("orders the cards by severity, warnings before information", () => {
    const observations = observe({
      hourlySessions: [...fourQuietWeeks("cs101", 10), sessionsOn(0, "cs101", 40)],
      hourly: [touchesOn(1, "lab")],
      now
    });
    const severities = observations.map((observation) => observation.severity);
    expect(severities.indexOf("warning")).toBeLessThan(severities.lastIndexOf("info"));
  });

  it("folds hourly rollups into sessions per course per day", () => {
    const byCourseDay = sessionsByCourseDay([sessionsOn(1, "cs101", 2), sessionsOn(1, "cs101", 3), sessionsOn(2, "cs101", 1)]);
    expect([...(byCourseDay.get("cs101") ?? [])].map(([, sessions]) => sessions).sort()).toEqual([1, 5]);
  });
});
