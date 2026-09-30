import { describe, expect, it } from "vitest";
import {
  courseFactsFrom,
  readerRoute,
} from "../../../apps/reader/src/lib/server/api/authorization.ts";
import {
  courseProgress,
  homeCourseIds,
  learningRecordsIn,
  MAX_HOME_COURSES,
  publishedOwner,
  RECORDS_PAGE,
  type VisitedLo,
} from "../../../apps/reader/src/lib/server/api/home.ts";

const course = {
  title: "C",
  los: [
    {
      type: "topic",
      route: "/topic/{{COURSEURL}}/t1",
      los: [
        {
          type: "lab",
          route: "/lab/{{COURSEURL}}/t1/lab-1",
          title: "Lab 1",
          los: [
            {
              type: "step",
              route: "/lab/{{COURSEURL}}/t1/lab-1/0",
              title: "Setup",
            },
          ],
        },
        {
          type: "lab",
          route: "/lab/{{COURSEURL}}/t1/lab-10",
          title: "Lab 10",
          los: [],
        },
        { type: "web", route: "https://example.com", title: "Link out" },
        {
          type: "panelvideo",
          route: "https://www.youtube.com/watch?v=x",
          title: "Panel video",
        },
        {
          type: "podcast",
          route: "/podcast/{{COURSEURL}}/t1/episode",
          title: "Episode",
        },
        {
          type: "note",
          route: "javascript:alert%28document.domain%29",
          title: "Not a reader page",
        },
        {
          type: "unit",
          route: "/topic/{{COURSEURL}}/t1/u1",
          los: [
            {
              type: "talk",
              route: "/talk/{{COURSEURL}}/t1/u1/slides",
              title: "Slides",
            },
          ],
        },
      ],
    },
    {
      type: "archive",
      route: "/archive/{{COURSEURL}}/code.zip",
      title: "Code",
    },
  ],
};

type Db = Parameters<typeof learningRecordsIn>[0];

describe("reader /api/home", () => {
  const los = courseFactsFrom("c", course).learningObjects;

  it("counts the pages a course publishes: not topics, units, lab steps, panels, podcasts, links out or routes outside the reader", () => {
    expect(los).toEqual([
      {
        route: "/lab/c/t1/lab-1",
        title: "Lab 1",
        type: "lab",
        steps: ["/lab/c/t1/lab-1/0"],
      },
      { route: "/lab/c/t1/lab-10", title: "Lab 10", type: "lab", steps: [] },
      { route: "/talk/c/t1/u1/slides", title: "Slides", type: "talk" },
    ]);
  });

  it("counts a lab step toward its lab, and a lab only once however many records it has", () => {
    const progress = courseProgress(los, [
      {
        course_id: "c",
        lo_id: "/lab/c/t1/lab-1",
        date_last_accessed: "2026-09-20T10:00:00Z",
      },
      {
        course_id: "c",
        lo_id: "/lab/c/t1/lab-1/0",
        date_last_accessed: "2026-09-21T10:00:00Z",
      },
    ]);
    expect(progress).toEqual({
      opened: 1,
      total: 3,
      continueAt: { route: "/lab/c/t1/lab-1/0", title: "Lab 1" },
    });
  });

  it("does not count lab-10 as a step of lab-1, and ignores records for pages the course no longer publishes", () => {
    const progress = courseProgress(los, [
      {
        course_id: "c",
        lo_id: "/lab/c/t1/lab-10",
        date_last_accessed: "2026-09-20T10:00:00Z",
      },
      {
        course_id: "c",
        lo_id: "/lab/c/t1/removed",
        date_last_accessed: "2026-09-22T10:00:00Z",
      },
    ]);
    expect(progress).toEqual({
      opened: 1,
      total: 3,
      continueAt: { route: "/lab/c/t1/lab-10", title: "Lab 10" },
    });
  });

  it("reports the profile's valid courses, most recent first, once each and at most the cap", () => {
    expect(
      homeCourseIds([
        { id: "old", lastVisit: "2026-01-01T00:00:00Z" },
        { id: "new", lastVisit: "2026-09-01T00:00:00Z" },
        { id: "../bad", lastVisit: "2026-09-02T00:00:00Z" },
        { id: "old", lastVisit: "2025-01-01T00:00:00Z" },
        null,
      ]),
    ).toEqual(["new", "old"]);
    const many = Array.from({ length: MAX_HOME_COURSES + 5 }, (_, i) => ({
      id: `c${i}`,
      lastVisit: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
    }));
    expect(homeCourseIds(many)).toHaveLength(MAX_HOME_COURSES);
  });

  it("accepts published lab steps and rejects invented descendants of labs and talks", () => {
    expect(publishedOwner(los, "/lab/c/t1/lab-1/0")?.title).toBe("Lab 1");
    for (const route of [
      "/lab/c/t1/lab-1/999",
      "/lab/c/t1/lab-1/0/missing",
      "/talk/c/t1/u1/slides/missing",
    ]) {
      expect(publishedOwner(los, route)).toBeUndefined();
      expect(
        courseProgress(los, [
          {
            course_id: "c",
            lo_id: route,
            date_last_accessed: "2026-09-30T09:00:00Z",
          },
        ]).continueAt,
      ).toBeNull();
    }
  });

  it("takes a route only as a path of the reader beneath its type and course", () => {
    expect(readerRoute("/lab/{{COURSEURL}}/t1/lab-1", "c")).toBe(
      "/lab/c/t1/lab-1",
    );
    expect(readerRoute("#note/c/t1/n1/", "c")).toBe("/note/c/t1/n1");
    for (const route of [
      "javascript:alert%28document.domain%29",
      "https://example.com/lab/c/x",
      "//evil.example/lab/c/x",
      "/lab/other/t1/lab-1",
      "/lab/c/t1/%2e%2e/x",
      "/lab/c/t1/../../x",
      "/lab/c/t1//x",
      "/lab/c/t1/x?y",
      "/lab/c/t1/x#y",
      "/lab/c/t1/a b",
      "/lab/c/t1\\x",
      "/JavaScript:/c/x",
    ]) {
      expect(readerRoute(route, "c"), route).toBeNull();
    }
  });

  it("reads every page of learning records, past the row cap, in a stable order", async () => {
    const all: VisitedLo[] = Array.from(
      { length: RECORDS_PAGE + 1 },
      (_, i) => ({
        course_id: "c",
        lo_id: `/lab/c/t1/lab-${String(i).padStart(4, "0")}`,
        date_last_accessed: `2026-09-${i === RECORDS_PAGE ? "30" : "01"}T10:00:00Z`,
      }),
    );
    const calls: { orders: string[]; from: number; to: number }[] = [];
    const db = {
      from: () => {
        const call = { orders: [] as string[], from: 0, to: 0 };
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          order: (column: string) => (call.orders.push(column), query),
          range: (from: number, to: number) => {
            Object.assign(call, { from, to });
            calls.push(call);
            return Promise.resolve({
              data: all.slice(from, Math.min(to + 1, from + RECORDS_PAGE)),
              error: null,
            });
          },
        };
        return query;
      },
    } as unknown as Db;

    const records = await learningRecordsIn(db, "alice", ["c"]);
    expect(records).toHaveLength(RECORDS_PAGE + 1);
    expect(calls.map((c) => [c.from, c.to])).toEqual([
      [0, RECORDS_PAGE - 1],
      [RECORDS_PAGE, 2 * RECORDS_PAGE - 1],
    ]);
    expect(calls[0].orders).toEqual(["course_id", "lo_id"]);
    const lab = (i: number) => ({
      route: `/lab/c/t1/lab-${String(i).padStart(4, "0")}`,
      title: `Lab ${i}`,
      type: "lab",
    });
    const progress = courseProgress(
      Array.from({ length: RECORDS_PAGE + 1 }, (_, i) => lab(i)),
      records,
    );
    expect(progress.opened).toBe(RECORDS_PAGE + 1);
    expect(progress.continueAt?.route).toBe(lab(RECORDS_PAGE).route);
  });

  it("asks for no records when there are no courses", async () => {
    expect(await learningRecordsIn({} as Db, "alice", [])).toEqual([]);
  });
});
