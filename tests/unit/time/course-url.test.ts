import { describe, it, expect, vi, afterEach } from "vitest";
import { courseJsonUrl } from "../../../packages/jsr/time/src/utils/course-url";
import { CourseTime } from "../../../packages/jsr/time/src/services/course-time";

/**
 * Course-id → tutors.json origin resolution.
 *
 * Two callers depend on this and both fail *silently* when it is wrong:
 * `CourseTime.getCoursePin` returns `""` (a PIN dialog no input can satisfy)
 * and `requireEducator` sees an empty educator list (every educator denied).
 * Neither surfaces an error, so the cases below are the only signal.
 */

describe("courseJsonUrl", () => {
  it("publishes a bare course id to netlify", () => {
    expect(courseJsonUrl("cs101-2025")).toBe("https://cs101-2025.netlify.app/tutors.json");
  });

  it("serves a localhost course over http", () => {
    expect(courseJsonUrl("localhost:5173")).toBe("http://localhost:5173/tutors.json");
  });

  it("serves a LAN address over http", () => {
    expect(courseJsonUrl("192.168.0.5:5173")).toBe("http://192.168.0.5:5173/tutors.json");
  });

  it("serves a self-hosted domain over https", () => {
    expect(courseJsonUrl("course.example.com")).toBe("https://course.example.com/tutors.json");
  });

  it("keeps an explicit scheme", () => {
    expect(courseJsonUrl("http://course.example.com")).toBe("http://course.example.com/tutors.json");
  });

  it("does not double the slash on a trailing one", () => {
    expect(courseJsonUrl("https://course.example.com/")).toBe("https://course.example.com/tutors.json");
  });

  it("treats an already-netlify domain as a domain, not a bare id", () => {
    // Otherwise it becomes `cs101.netlify.app.netlify.app`.
    expect(courseJsonUrl("cs101.netlify.app")).toBe("https://cs101.netlify.app/tutors.json");
  });

  it("trims surrounding whitespace", () => {
    expect(courseJsonUrl("  cs101-2025  ")).toBe("https://cs101-2025.netlify.app/tutors.json");
  });
});

describe("CourseTime.getCoursePin", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(impl: (url: string) => unknown) {
    const fetchMock = vi.fn(async (url: string) => impl(url) as Response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("reads the pin from a locally served course", async () => {
    const fetchMock = stubFetch(() => ({
      ok: true,
      json: async () => ({ properties: { ignorepin: "1234" } })
    }));

    await expect(CourseTime.getCoursePin("localhost:54321")).resolves.toBe("1234");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:54321/tutors.json");
  });

  it("reads the pin from a netlify course", async () => {
    const fetchMock = stubFetch(() => ({
      ok: true,
      json: async () => ({ properties: { ignorepin: 4019 } })
    }));

    await CourseTime.getCoursePin("cs101-2025");
    expect(fetchMock).toHaveBeenCalledWith("https://cs101-2025.netlify.app/tutors.json");
  });

  it("stringifies a numeric pin", async () => {
    // `ignorepin: 4321` in properties.yaml is a YAML integer, and the reference
    // course writes it that way — the signature says string, so return one.
    stubFetch(() => ({ ok: true, json: async () => ({ properties: { ignorepin: 4321 } }) }));
    const pin = await CourseTime.getCoursePin("cs101-2025");
    expect(pin).toBe("4321");
    expect(typeof pin).toBe("string");
  });

  it("returns empty when the course sets no pin", async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ properties: {} }) }));
    await expect(CourseTime.getCoursePin("cs101-2025")).resolves.toBe("");
  });

  it("returns empty for a blank course id without fetching", async () => {
    const fetchMock = stubFetch(() => ({ ok: true, json: async () => ({}) }));
    await expect(CourseTime.getCoursePin("   ")).resolves.toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns empty when the course is unreachable", async () => {
    stubFetch(() => {
      throw new Error("ENOTFOUND");
    });
    await expect(CourseTime.getCoursePin("cs101-2025")).resolves.toBe("");
  });

  it("returns empty on a non-ok response", async () => {
    stubFetch(() => ({ ok: false, status: 404, json: async () => ({}) }));
    await expect(CourseTime.getCoursePin("cs101-2025")).resolves.toBe("");
  });
});
