import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course, Lab } from "@tutors/tutors-model-lib";
import { courseProtocol } from "../../../packages/svelte/runes/src/index.svelte.ts";
import { courseService } from "../../../packages/svelte/course/src/course/services/course.svelte.ts";
import { courseProtocolOf, determineCourseUrl } from "../../../packages/svelte/course/src/course/services/lo-tree.ts";
import { markdownService } from "../../../packages/svelte/course/src/markdown/index.ts";
import { labShape, shape } from "../../bdd/support/course.ts";
import { publishedCourseJson } from "../../bdd/support/reader-loading.ts";

// `rune()` wraps a value in `$state`, which needs the Svelte compiler; the service only reads and writes `.value`.
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../bdd/support/runes-stub.ts"));

/** Issue #528: one address form, one fetch URL, one cache id, and a protocol that belongs to the course. */
describe("determineCourseUrl", () => {
  it.each([
    ["web-dev-101", "web-dev-101", "web-dev-101.netlify.app", "https://"],
    ["web-dev-101.netlify.app", "web-dev-101", "web-dev-101.netlify.app", "https://"],
    ["https://web-dev-101.netlify.app", "web-dev-101", "web-dev-101.netlify.app", "https://"],
    ["https://web-dev-101.netlify.app/", "web-dev-101", "web-dev-101.netlify.app", "https://"],
    ["HTTPS://Web-Dev-101.Netlify.App", "web-dev-101", "web-dev-101.netlify.app", "https://"],
    ["  web-dev-101  ", "web-dev-101", "web-dev-101.netlify.app", "https://"],
    ["example.com", "example.com", "example.com", "https://"],
    ["https://example.com", "example.com", "example.com", "https://"],
    ["example.com:8080", "example.com:8080", "example.com:8080", "https://"],
    ["courses.example.edu/web/dev-101//", "courses.example.edu/web/dev-101", "courses.example.edu/web/dev-101", "https://"],
    ["https://courses.example.edu/web/dev-101?term=1#top", "courses.example.edu/web/dev-101", "courses.example.edu/web/dev-101", "https://"],
    ["http://courses.example.edu", "courses.example.edu", "courses.example.edu", "http://"],
    ["localhost", "localhost", "localhost", "http://"],
    ["localhost:3000", "localhost:3000", "localhost:3000", "http://"],
    ["http://localhost:3000/", "localhost:3000", "localhost:3000", "http://"],
    ["192.168.1.100:8080/course", "192.168.1.100:8080/course", "192.168.1.100:8080/course", "http://"],
    ["127.0.0.1:5173", "127.0.0.1:5173", "127.0.0.1:5173", "http://"]
  ])("resolves %j to id %j at %j over %s", (input, courseId, courseUrl, protocol) => {
    expect(determineCourseUrl(input)).toEqual({ courseId, courseUrl, protocol });
  });

  it.each(["ftp://example.com/course", "file:///etc/passwd", "javascript://example.com"])("rejects the unsupported scheme in %j", (input) => {
    expect(() => determineCourseUrl(input)).toThrow(/Unsupported course URL scheme/);
  });

  it.each(["", "   ", "https://", "my course", "https://user:secret@example.com", "example.com:notaport"])("rejects the malformed address %j", (input) => {
    expect(() => determineCourseUrl(input)).toThrow(/Malformed course URL/);
  });

  it("does not change the shared protocol", () => {
    courseProtocol.value = "https://";
    determineCourseUrl("localhost:3000");
    expect(courseProtocol.value).toBe("https://");
  });
});

/** A course host that serves the course everywhere and records every URL asked for. */
function host() {
  const requested: string[] = [];
  const json = publishedCourseJson("Web Development 101", [shape("topic", "Topic 1", [labShape("Lab 1.1", [{ title: "Setup", contentMd: "![diagram](img/diagram.png)" }])])]);
  const fetch = vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => {
    requested.push(String(input));
    return new Response(json);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, requested };
}

/** Every image source in the course's first lab, once the reader has converted it. */
function labImages(course: Course): string[] {
  const lab = [...course.loIndex.values()].find((lo) => lo.type === "lab") as Lab;
  markdownService.convertLabToHtml(course, lab);
  return lab.los.flatMap((step) => [...step.contentHtml!.matchAll(/src="([^"]+)"/g)].map((match) => match[1]));
}

describe("courseService: course address and protocol", () => {
  beforeEach(() => {
    // Only the cache: the shared protocol keeps whatever the previous test left, as a session would.
    courseService.courses.clear();
  });

  it("fetches tutors.json once for a bare id, its Netlify host and its full https URL", async () => {
    const { fetch, requested } = host();
    const courses = [
      await courseService.readCourse("web-dev-101", fetch),
      await courseService.readCourse("web-dev-101.netlify.app", fetch),
      await courseService.readCourse("https://web-dev-101.netlify.app/", fetch)
    ];
    expect(requested).toEqual(["https://web-dev-101.netlify.app/tutors.json"]);
    expect(new Set(courses).size).toBe(1);
    expect(courses[0].courseId).toBe("web-dev-101");
    expect(courses[0].img).toBe("https://web-dev-101.netlify.app/course.png");
  });

  it("serves a hosted course over https after a local one, and a local one over http after a hosted one", async () => {
    const { fetch, requested } = host();
    const local = await courseService.readCourse("localhost:3000", fetch);
    expect(courseProtocol.value).toBe("http://");
    const hosted = await courseService.readCourse("web-dev-101", fetch);
    expect(courseProtocol.value).toBe("https://");
    const otherLocal = await courseService.readCourse("192.168.1.100:8080", fetch);
    expect(requested).toEqual(["http://localhost:3000/tutors.json", "https://web-dev-101.netlify.app/tutors.json", "http://192.168.1.100:8080/tutors.json"]);
    expect(local.img).toBe("http://localhost:3000/course.png");
    expect(hosted.img).toBe("https://web-dev-101.netlify.app/course.png");
    expect(otherLocal.img).toBe("http://192.168.1.100:8080/course.png");
  });

  it("restores a cached course's own protocol when it is selected again", async () => {
    const { fetch, requested } = host();
    const hosted = await courseService.readCourse("web-dev-101", fetch);
    await courseService.readCourse("localhost:3000", fetch);
    expect(await courseService.readCourse("web-dev-101", fetch)).toBe(hosted);
    expect(requested).toHaveLength(2);
    expect(courseProtocol.value).toBe("https://");
    expect(labImages(hosted).every((src) => src.startsWith("https://web-dev-101.netlify.app/"))).toBe(true);
  });

  it("keeps each course's protocol when two loads overlap and finish out of order", async () => {
    const json = publishedCourseJson("Overlap", [shape("topic", "Topic 1", [labShape("Lab 1.1", [{ title: "Setup", contentMd: "![diagram](img/diagram.png)" }])])]);
    const pending = new Map<string, () => void>();
    const fetch = ((input: Parameters<typeof globalThis.fetch>[0]) =>
      new Promise<Response>((resolve) => pending.set(String(input), () => resolve(new Response(json))))) as typeof globalThis.fetch;

    const localLoad = courseService.getOrLoadCourse("localhost:3000", fetch);
    const hostedLoad = courseService.getOrLoadCourse("web-dev-101", fetch);
    expect([...pending.keys()]).toEqual(["http://localhost:3000/tutors.json", "https://web-dev-101.netlify.app/tutors.json"]);
    pending.get("https://web-dev-101.netlify.app/tutors.json")!();
    const hosted = await hostedLoad;
    pending.get("http://localhost:3000/tutors.json")!();
    const local = await localLoad;

    expect(courseProtocolOf(hosted)).toBe("https://");
    expect(courseProtocolOf(local)).toBe("http://");
    expect(labImages(hosted)).toEqual(["https://web-dev-101.netlify.app/topic-0/lab-0/img/diagram.png"]);
    expect(labImages(local)).toEqual(["http://localhost:3000/topic-0/lab-0/img/diagram.png"]);
  });

  it("rejects an unsupported scheme without fetching", async () => {
    const { fetch, requested } = host();
    await expect(courseService.readCourse("ftp://example.com/course", fetch)).rejects.toThrow(/Unsupported course URL scheme/);
    expect(requested).toEqual([]);
  });
});
