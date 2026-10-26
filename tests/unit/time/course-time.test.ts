import { afterEach, expect, it, vi } from "vitest";
import { CourseTime } from "../../../packages/jsr/time/src/services/course-time.ts";

afterEach(() => vi.unstubAllGlobals());

it("loads a course pin from its published tutors.json", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ properties: { ignorepin: "1234" } }) });
  vi.stubGlobal("fetch", fetch);

  expect(await CourseTime.getCoursePin("  example-course  ")).toBe("1234");
  expect(fetch).toHaveBeenCalledWith("https://example-course.netlify.app/tutors.json");
});

it("returns no pin when a course has no published tutors.json", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", fetch);

  expect(await CourseTime.getCoursePin("example-course")).toBe("");
  expect(await CourseTime.getCoursePin("  ")).toBe("");
  expect(fetch).toHaveBeenCalledTimes(1);
});
