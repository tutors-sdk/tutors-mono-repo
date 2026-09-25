import { describe, expect, it } from "vitest";
import * as check from "../../../apps/reader/src/lib/server/api/validate.ts";
import { courseFactsFrom, courseJsonUrl, createCourseAccess, listFromEnv } from "../../../apps/reader/src/lib/server/api/course-access.ts";
import { whiteboardRoomId } from "../../../apps/reader/src/lib/server/api/store.ts";

describe("reader /api input checks", () => {
  it("keeps personal whiteboard rooms outside the public shared namespace", () => {
    expect(whiteboardRoomId("web-dev-101", "lab-1", "alice"))
      .not.toBe(whiteboardRoomId("web-dev-101", "lab-1-alice", null));
  });
  it("accepts course ids that are Netlify site names or host names, and nothing that could leave the host", () => {
    expect(check.courseId("web-dev-101")).toBe("web-dev-101");
    expect(check.courseId(" courses.example.org ")).toBe("courses.example.org");
    for (const bad of ["", "../etc", "a/b", "a..b", "-lead", "trail-", "x".repeat(300), 42, null]) expect(check.courseId(bad), String(bad)).toBeNull();
  });

  it("accepts learning-object routes and rejects control characters and oversized values", () => {
    expect(check.loRoute("/lab/web-dev-101/topic-01/book-a/01")).toBe("/lab/web-dev-101/topic-01/book-a/01");
    expect(check.loRoute("@settings/show-locked")).toBe("@settings/show-locked");
    expect(check.loRoute("/lab/x\n")).toBe("/lab/x");
    expect(check.loRoute("/lab/<script>")).toBeNull();
    expect(check.loRoute("/".repeat(513))).toBeNull();
  });

  it("keeps a bounded single-line string", () => {
    expect(check.text("  Ada  ", 10)).toBe("Ada");
    expect(check.text("a\u0007b", 10)).toBeNull();
    expect(check.text("x".repeat(11), 10)).toBeNull();
  });

  it("accepts only https image URLs and icon objects with short strings", () => {
    expect(check.imageUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(check.imageUrl("javascript:alert(1)")).toBeNull();
    expect(check.imageUrl("http://example.com/a.png")).toBeNull();
    expect(check.icon({ type: "mdi:school", color: "red" })).toEqual({ type: "mdi:school", color: "red" });
    expect(check.icon({ type: "" })).toBeNull();
  });

  it("accepts the browser's local day within one day of the server's, and no other", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    expect(check.calendarDay("2026-09-25", now)).toBe("2026-09-25");
    expect(check.calendarDay("2026-09-24", now)).toBe("2026-09-24");
    expect(check.calendarDay("2026-09-26", now)).toBe("2026-09-26");
    expect(check.calendarDay("2026-09-27", now)).toBeNull();
    expect(check.calendarDay("2026-02-30", now)).toBeNull();
    expect(check.calendarDay("25/09/2026", now)).toBeNull();
  });

  it("accepts only the sentiments and statuses the reader offers", () => {
    expect(check.sentiment("fine", ["fine", "neutral"])).toBe("fine");
    expect(check.sentiment("evil", ["fine", "neutral"])).toBeNull();
    expect(check.onlineStatus("offline")).toBe("offline");
    expect(check.onlineStatus("away")).toBeNull();
    expect(check.loType("lab")).toBe("lab");
    expect(check.loType("Lab; drop")).toBeNull();
  });
});

describe("reader course access", () => {
  it("fetches tutors.json only from the course's Netlify site or an allowed host", () => {
    expect(courseJsonUrl("web-dev-101")).toBe("https://web-dev-101.netlify.app/tutors.json");
    expect(courseJsonUrl("web-dev-101.netlify.app")).toBe("https://web-dev-101.netlify.app/tutors.json");
    expect(courseJsonUrl("courses.example.org")).toBeNull();
    expect(courseJsonUrl("courses.example.org", ["courses.example.org"])).toBe("https://courses.example.org/tutors.json");
    expect(courseJsonUrl("169.254.169.254")).toBeNull();
    expect(courseJsonUrl("localhost:5173")).toBeNull();
  });

  it("reads educators, privacy, title and credits from a published course", () => {
    expect(courseFactsFrom("c", { title: "C", properties: { private: 1, credits: "Staff" }, enrollment: { educators: ["eve", 7, " bob "] } })).toEqual({
      courseId: "c",
      title: "C",
      educators: ["eve", "bob"],
      isPrivate: true,
      credits: "Staff"
    });
    expect(courseFactsFrom("c", null)).toEqual({ courseId: "c", title: null, educators: [], isPrivate: false, credits: null });
  });

  it("makes a login an educator from enrollment.yaml or the admin list, caching the course", async () => {
    let fetches = 0;
    const access = createCourseAccess({
      fetch: (async () => {
        fetches++;
        return new Response(JSON.stringify({ enrollment: { educators: ["eve"] } }));
      }) as unknown as typeof fetch,
      admins: listFromEnv("root, ops")
    });
    expect(await access.isEducator("eve", "c")).toBe(true);
    expect(await access.isEducator("alice", "c")).toBe(false);
    expect(await access.isEducator("ops", "other")).toBe(true);
    expect(await access.isEducator("", "c")).toBe(false);
    expect(fetches).toBe(1);
  });

  it("does not cache a course it could not find, so it recovers once the course is published", async () => {
    let published = false;
    const access = createCourseAccess({
      fetch: (async () => (published ? new Response(JSON.stringify({ enrollment: { educators: ["eve"] } })) : new Response("", { status: 404 }))) as unknown as typeof fetch
    });
    expect(await access.isEducator("eve", "c")).toBe(false);
    published = true;
    await Promise.resolve();
    expect(await access.isEducator("eve", "c")).toBe(true);
  });
});

describe("reader course access: redirects", () => {
  it("follows a course site's redirect only to a public https host", async () => {
    const { redirectTarget } = await import("../../../apps/reader/src/lib/server/api/course-access.ts");
    const from = "https://web-dev-101.netlify.app/tutors.json";
    expect(redirectTarget(from, "https://courses.example.org/tutors.json")).toBe("https://courses.example.org/tutors.json");
    expect(redirectTarget(from, "/elsewhere/tutors.json")).toBe("https://web-dev-101.netlify.app/elsewhere/tutors.json");
    for (const bad of ["http://courses.example.org/tutors.json", "https://169.254.169.254/latest", "https://localhost/x", "https://[::1]/x", "https://metadata.google.internal/x", "https://intranet/x", null]) {
      expect(redirectTarget(from, bad), String(bad)).toBeNull();
    }
  });

  it("reads educators from a course site that redirects to its custom domain", async () => {
    const access = createCourseAccess({
      fetch: (async (url: string) =>
        url.includes("netlify.app")
          ? new Response(null, { status: 301, headers: { location: "https://courses.example.org/tutors.json" } })
          : new Response(JSON.stringify({ enrollment: { educators: ["eve"] } }))) as unknown as typeof fetch
    });
    expect(await access.isEducator("eve", "web-dev-101")).toBe(true);
  });

  it("gives up on a redirect to an internal address", async () => {
    const access = createCourseAccess({
      fetch: (async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })) as unknown as typeof fetch
    });
    expect(await access.isEducator("eve", "web-dev-101")).toBe(false);
  });
});
