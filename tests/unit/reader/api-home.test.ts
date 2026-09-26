import { describe, expect, it } from "vitest";
import { courseFactsFrom } from "../../../apps/reader/src/lib/server/api/authorization.ts";
import { courseProgress, homeCourseIds, MAX_HOME_COURSES } from "../../../apps/reader/src/lib/server/api/home.ts";

const course = {
  title: "C",
  los: [
    {
      type: "topic",
      route: "/topic/{{COURSEURL}}/t1",
      los: [
        { type: "lab", route: "/lab/{{COURSEURL}}/t1/lab-1", title: "Lab 1", los: [{ type: "step", route: "/lab/{{COURSEURL}}/t1/lab-1/0", title: "Setup" }] },
        { type: "lab", route: "/lab/{{COURSEURL}}/t1/lab-10", title: "Lab 10", los: [] },
        { type: "web", route: "https://example.com", title: "Link out" },
        { type: "panelvideo", route: "https://www.youtube.com/watch?v=x", title: "Panel video" },
        { type: "unit", route: "/topic/{{COURSEURL}}/t1/u1", los: [{ type: "talk", route: "/talk/{{COURSEURL}}/t1/u1/slides", title: "Slides" }] }
      ]
    },
    { type: "archive", route: "/archive/{{COURSEURL}}/code.zip", title: "Code" }
  ]
};

describe("reader /api/home", () => {
  const los = courseFactsFrom("c", course).learningObjects;

  it("counts the pages a course publishes: not topics, units, lab steps, panels or links out", () => {
    expect(los).toEqual([
      { route: "/lab/c/t1/lab-1", title: "Lab 1" },
      { route: "/lab/c/t1/lab-10", title: "Lab 10" },
      { route: "/talk/c/t1/u1/slides", title: "Slides" }
    ]);
  });

  it("counts a lab step toward its lab, and a lab only once however many records it has", () => {
    const progress = courseProgress(los, [
      { course_id: "c", lo_id: "/lab/c/t1/lab-1", date_last_accessed: "2026-09-20T10:00:00Z" },
      { course_id: "c", lo_id: "/lab/c/t1/lab-1/0", date_last_accessed: "2026-09-21T10:00:00Z" }
    ]);
    expect(progress).toEqual({ opened: 1, total: 3, continueAt: { route: "/lab/c/t1/lab-1/0", title: "Lab 1" } });
  });

  it("does not count lab-10 as a step of lab-1, and ignores records for pages the course no longer publishes", () => {
    const progress = courseProgress(los, [
      { course_id: "c", lo_id: "/lab/c/t1/lab-10", date_last_accessed: "2026-09-20T10:00:00Z" },
      { course_id: "c", lo_id: "/lab/c/t1/removed", date_last_accessed: "2026-09-22T10:00:00Z" }
    ]);
    expect(progress).toEqual({ opened: 1, total: 3, continueAt: { route: "/lab/c/t1/lab-10", title: "Lab 10" } });
  });

  it("reports the profile's valid courses, most recent first, once each and at most the cap", () => {
    expect(
      homeCourseIds([
        { id: "old", lastVisit: "2026-01-01T00:00:00Z" },
        { id: "new", lastVisit: "2026-09-01T00:00:00Z" },
        { id: "../bad", lastVisit: "2026-09-02T00:00:00Z" },
        { id: "old", lastVisit: "2025-01-01T00:00:00Z" },
        null
      ])
    ).toEqual(["new", "old"]);
    const many = Array.from({ length: MAX_HOME_COURSES + 5 }, (_, i) => ({ id: `c${i}`, lastVisit: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z` }));
    expect(homeCourseIds(many)).toHaveLength(MAX_HOME_COURSES);
  });
});
