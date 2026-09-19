import { describe, expect, it } from "vitest";
import { coursesFor, createMemoryWarehouse, heatmapFor, observationsFor, statsFor } from "@tutors/live-store";
import { daysAgo, seed } from "./fixtures.ts";

/**
 * What `/api/live/*` answers, against a seeded warehouse.
 *
 * This is the acceptance the plan asks for at phase 3 - the API returns correct
 * counts against fixtures - expressed against the read model rather than over
 * HTTP, so a wrong number fails here rather than in a browser.
 */

const now = new Date(2026, 8, 17, 15, 0);

/** Two courses over a week: cs101 busy and varied, cs200 quiet and lab-only. */
async function seeded() {
  const warehouse = createMemoryWarehouse();
  await seed(warehouse, [
    {
      sid: "s1",
      course: "cs101",
      at: daysAgo(now, 0, 9),
      views: [
        { lo: "/lab-1", loType: "lab", service: "lab" },
        { lo: "/talk-1", loType: "talk", service: "talk" }
      ],
      durationSec: 600
    },
    {
      sid: "s2",
      course: "cs101",
      at: daysAgo(now, 1, 11),
      views: [{ lo: "/lab-1", loType: "lab", service: "lab" }],
      durationSec: 1800,
      uid: "hash-1"
    },
    {
      sid: "s3",
      course: "cs200",
      at: daysAgo(now, 2, 20),
      views: [{ lo: "/lab-9", loType: "lab", service: "lab" }],
      durationSec: 300
    }
  ]);
  return warehouse;
}

describe("read API", () => {
  it("counts sessions, views and durations over the range", async () => {
    const response = await statsFor(await seeded(), "7d", null, now);

    expect(response.stats).toMatchObject({
      range: "7d",
      course: null,
      sessions: 3,
      uniqueSessions: 3,
      views: 4,
      medianSessionSec: 600,
      p90SessionSec: 1800,
      activeCourses: 2,
      optedInLearners: 1
    });
    expect(response.generatedAt).toBe(now.toISOString());
  });

  it("narrows every part of the response to one course, and adds its learning objects", async () => {
    const response = await statsFor(await seeded(), "7d", "cs101", now);

    expect(response.stats).toMatchObject({ course: "cs101", sessions: 2, views: 3 });
    expect(response.topCourses.map((course) => course.course)).toEqual(["cs101"]);
    expect(response.topLos).toEqual([
      { lo: "/lab-1", loType: "lab", views: 2 },
      { lo: "/talk-1", loType: "talk", views: 1 }
    ]);
  });

  it("leaves the learning object list out when no course is selected", async () => {
    expect((await statsFor(await seeded(), "7d", null, now)).topLos).toBeUndefined();
  });

  it("counts only today for the today range", async () => {
    const response = await statsFor(await seeded(), "today", null, now);
    expect(response.stats).toMatchObject({ sessions: 1, views: 2 });
  });

  it("ranks the top courses by sessions", async () => {
    const response = await statsFor(await seeded(), "7d", null, now);
    expect(response.topCourses).toEqual([
      { course: "cs101", sessions: 2, views: 3 },
      { course: "cs200", sessions: 1, views: 1 }
    ]);
  });

  it("reports the service mix over the range", async () => {
    const mix = (await statsFor(await seeded(), "7d", null, now)).serviceMix;
    expect(mix.find((entry) => entry.service === "lab")).toEqual({ service: "lab", touches: 3 });
    expect(mix.find((entry) => entry.service === "talk")).toEqual({ service: "talk", touches: 1 });
    expect(mix.find((entry) => entry.service === "video")).toEqual({ service: "video", touches: 0 });
  });

  it("builds each heat map from the rollups its kind needs", async () => {
    const warehouse = await seeded();

    const byHour = await heatmapFor(warehouse, "service", "7d", null, now);
    expect(byHour.y).toHaveLength(7);
    expect(byHour.x).toHaveLength(24);
    // cs200's session is at 20:00, three days back on a Tuesday.
    expect(byHour.cells.flat().reduce((total, value) => total + value, 0)).toBe(4);

    const byDay = await heatmapFor(warehouse, "service-monthly", "7d", null, now);
    expect(byDay.y).toContain("lab");
    expect(byDay.cells).toHaveLength(12);

    const byCourse = await heatmapFor(warehouse, "course", "7d", null, now);
    expect(byCourse.y).toEqual(["cs101", "cs200"]);
    expect(byCourse.unit).toBe("sessions");
  });

  it("scopes a heat map to one course", async () => {
    const matrix = await heatmapFor(await seeded(), "course", "7d", "cs200", now);
    expect(matrix.y).toEqual(["cs200"]);
  });

  it("raises a silent-service card for a service nobody touched, and names the used ones as used", async () => {
    const observations = await observationsFor(await seeded(), "7d", now);
    const silent = observations.filter((observation) => observation.kind === "silent-service").map((observation) => observation.service);

    expect(silent).toContain("video");
    expect(silent).not.toContain("lab");
    expect(silent).not.toContain("talk");
  });

  it("raises an out-of-term card only when term windows are configured", async () => {
    const warehouse = await seeded();
    const withoutTerms = await observationsFor(warehouse, "7d", now);
    expect(withoutTerms.filter((observation) => observation.kind === "out-of-term")).toEqual([]);

    const terms = [{ name: "Semester 1", from: "2026-10-05", to: "2026-12-18" }];
    const withTerms = await observationsFor(warehouse, "7d", now, terms);
    // The seeded courses are well below the out-of-term threshold, so the rule
    // is configured but correctly quiet.
    expect(withTerms.filter((observation) => observation.kind === "out-of-term")).toEqual([]);
  });

  it("offers every course seen in the last 30 days to the filter", async () => {
    expect(await coursesFor(await seeded(), now)).toEqual(["cs101", "cs200"]);
  });
});
