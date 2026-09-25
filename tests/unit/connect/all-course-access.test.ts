import { describe, it, expect, vi, beforeEach } from "vitest";

// Course visits reach the catalogue through the reader's POST /api/courses/visit. The browser half
// (updateCourseList) and the server half (the route handler, with the service_role client) are both
// the real code; the database is the Supabase recorder and the course host is a stubbed fetch.
// By the path product code resolves (the reader and community share one install), and by name for a hoisted install.
vi.mock("../../../packages/svelte/community/node_modules/@supabase/supabase-js/dist/index.mjs", async () => ({ createClient: (await import("../../bdd/support/supabase-recorder.ts")).createClient }));
vi.mock("@supabase/supabase-js", async () => ({ createClient: (await import("../../bdd/support/supabase-recorder.ts")).createClient }));
vi.mock("$env/dynamic/public", () => ({
  env: { PUBLIC_SUPABASE_URL: "https://mock.supabase.co", PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key", PUBLIC_ANON_MODE: "FALSE" }
}));
vi.mock("$env/dynamic/private", async () => ({ env: (await import("../../bdd/support/supabase-recorder.ts")).privateEnv }));

import type { Course } from "@tutors/tutors-model-lib";
import { updateCourseList } from "../../../packages/svelte/connect/src/utils/allCourseAccess";
import { POST } from "../../../apps/reader/src/routes/api/courses/visit/+server.ts";
import { recorder } from "../../bdd/support/supabase-recorder.ts";

function createMockCourse(overrides: Partial<Course> = {}): Course {
  return {
    type: "course",
    courseId: overrides.courseId ?? "valid-course-1",
    title: overrides.title ?? "Test Course",
    img: overrides.img ?? "https://example.com/img.png",
    properties: { credits: "5", ...(overrides.properties ?? {}) },
    isPrivate: overrides.isPrivate ?? false,
    ...overrides
  } as Course;
}

/** What the browser sent, as parsed JSON bodies of POST /api/courses/visit. */
let sent: { courseId: string; courseRecord: Record<string, unknown> }[];

/** The published tutors.json of each course the host serves. */
const published = new Map<string, unknown>([
  ["valid-course-1", { title: "Published Title", properties: { credits: "Published Credits", private: 0 } }],
  ["private-course", { title: "Private Course", properties: { credits: "Staff", private: 1 } }]
]);

function courseHost(input: RequestInfo | URL): Response {
  const url = new URL(String(input));
  const id = url.hostname.replace(/\.netlify\.app$/, "");
  const json = published.get(id);
  return json ? new Response(JSON.stringify(json), { status: 200 }) : new Response("Not Found", { status: 404 });
}

async function visit(courseId: string, courseRecord: Record<string, unknown> = {}): Promise<Response> {
  const request = new Request("https://reader.test/api/courses/visit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ courseId, courseRecord })
  });
  return POST({ request } as Parameters<typeof POST>[0]).catch((e: { status?: number }) => {
    // Only a SvelteKit error(...) is an answer; anything else is a bug the test must show.
    if (typeof e.status !== "number") throw e;
    return new Response(null, { status: e.status });
  });
}

beforeEach(() => {
  recorder.reset();
  sent = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/courses/visit") {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    return courseHost(input);
  });
});

describe("allCourseAccess: updateCourseList sends the visit to the reader", () => {
  it("posts the course id and its card record", async () => {
    await updateCourseList(createMockCourse({ courseId: "record-course", title: "Record Course", properties: { credits: "10" } as never }));

    expect(sent).toEqual([{ courseId: "record-course", courseRecord: expect.objectContaining({ id: "record-course", title: "Record Course", credits: "10", private: false }) }]);
  });

  it("sends the image when the course has no icon, and the icon when it has one", async () => {
    await updateCourseList(createMockCourse({ img: "https://example.com/thumb.png" }));
    await updateCourseList(createMockCourse({ properties: { credits: "5", icon: { type: "mdi:school", color: "red" } } as never }));

    expect(sent[0].courseRecord).toMatchObject({ img: "https://example.com/thumb.png" });
    expect(sent[0].courseRecord.icon).toBeUndefined();
    expect(sent[1].courseRecord).toMatchObject({ icon: { type: "mdi:school", color: "red" } });
  });

  it.each(["main--some-branch", "master--some-branch", "deploy-preview--123", "some--invalid--name"])("sends nothing for the branch or preview build %s", async (courseId) => {
    await updateCourseList(createMockCourse({ courseId }));

    expect(sent).toEqual([]);
  });

  it.each(["web-development-2025", "intro-to-programming"])("sends a visit for %s", async (courseId) => {
    await updateCourseList(createMockCourse({ courseId }));

    expect(sent.map((s) => s.courseId)).toEqual([courseId]);
  });
});

describe("POST /api/courses/visit on the reader's server", () => {
  it("inserts a new course with visit_count 1, titled from the published course", async () => {
    const response = await visit("valid-course-1", { title: "A title the browser made up", credits: "made up" });

    expect(response.status).toBe(204);
    expect(recorder.rows("tutors-connect-courses")).toMatchObject([
      { course_id: "valid-course-1", visit_count: 1, course_record: { id: "valid-course-1", title: "Published Title", credits: "Published Credits", private: false } }
    ]);
  });

  it("increments visit_count when the course is already in the catalogue", async () => {
    recorder.seed("tutors-connect-courses", [{ course_id: "valid-course-1", visit_count: 5 }]);

    await visit("valid-course-1");

    expect(recorder.rows("tutors-connect-courses")).toMatchObject([{ course_id: "valid-course-1", visit_count: 6 }]);
  });

  it("marks a private course private whatever the browser says", async () => {
    await visit("private-course", { private: false });

    expect(recorder.rows("tutors-connect-courses")[0]).toMatchObject({ course_record: { private: true } });
  });

  it("keeps an https image or an icon from the browser, and drops anything else", async () => {
    await visit("valid-course-1", { img: "javascript:alert(1)" });
    expect(recorder.rows("tutors-connect-courses")[0].course_record).not.toHaveProperty("img");

    await visit("valid-course-1", { img: "https://example.com/thumb.png" });
    expect(recorder.rows("tutors-connect-courses")[0].course_record).toMatchObject({ img: "https://example.com/thumb.png" });
  });

  it("refuses a course its host does not publish, and writes nothing", async () => {
    const response = await visit("no-such-course");

    expect(response.status).toBe(404);
    expect(recorder.rows("tutors-connect-courses")).toEqual([]);
  });

  it("never fetches a host other than the course's Netlify site", async () => {
    const response = await visit("attacker.example");

    expect(response.status).toBe(404);
    expect(recorder.tableCalls).toEqual([]);
  });

  it("counts nothing for branch and preview builds", async () => {
    const response = await visit("deploy-preview--123");

    expect(response.status).toBe(204);
    expect(recorder.tableCalls).toEqual([]);
  });
});
