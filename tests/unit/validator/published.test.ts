import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublishedCourse, publishedCourseUrl, validatePublishedCourse } from "../../../apps/validator/src/lib/published.ts";
import { publishedCourse } from "../../support/published-course.ts";

afterEach(() => vi.unstubAllGlobals());

describe("published course addresses", () => {
  it.each([
    [" web-dev ", "https://web-dev.netlify.app/tutors.json"],
    ["web-dev.netlify.app", "https://web-dev.netlify.app/tutors.json"],
    ["https://example.edu/course/", "https://example.edu/course/tutors.json"],
    ["https://example.edu/tutors.json?cache=1#top", "https://example.edu/tutors.json"],
    ["http://localhost:8000/", "http://localhost:8000/tutors.json"],
    ["https://tutors.dev/course/web-dev", "https://web-dev.netlify.app/tutors.json"],
    ["https://tutors.dev/course/example.edu%2Fteaching", "https://example.edu/teaching/tutors.json"]
  ])("resolves %s", (input, expected) => expect(publishedCourseUrl(input)).toBe(expected));

  it.each(["", "ftp://example.edu", "https://user:secret@example.edu", "https://tutors.dev/course/https%3A%2F%2Ftutors.dev%2Fcourse%2Fx"])("rejects %s", (input) => {
    expect(() => publishedCourseUrl(input)).toThrow();
  });
});

describe("published findings", () => {
  it("reports legacy authLevel omissions once without mutating data or hiding other errors", () => {
    const legacy = { ...publishedCourse, authLevel: undefined };
    const course = { ...legacy, los: [{ ...legacy, type: "topic" }], enrollment: { students: [{ name: "Alice" }] } };
    const original = structuredClone(course);
    const findings = validatePublishedCourse(course);
    expect(findings.filter(f => f.rule === "V020")).toMatchObject([{ severity: "warn", message: expect.stringContaining("2 course item(s)") }]);
    expect(findings).toContainEqual(expect.objectContaining({ rule: "V006", severity: "error" }));
    expect(course).toEqual(original);
    expect(validatePublishedCourse({ ...legacy, authLevel: "private" })).toContainEqual(expect.objectContaining({ rule: "V020", severity: "error" }));
  });
  it("accepts generated course data and supported enrollment", () => {
    expect(validatePublishedCourse({ ...publishedCourse, enrollment: { educators: ["lecturer"], whitelist: ["alice"], students: [{ name: "Alice", id: "alice" }] } })).toEqual([]);
  });

  it.each([{ students: [{ name: "Alice", github: "alice" }] }, { whitelist: "alice" }, { educators: [null] }])(
    "flags enrollment problems that can break course services: %j",
    (enrollment) => {
      expect(validatePublishedCourse({ ...publishedCourse, enrollment })).toContainEqual(expect.objectContaining({ rule: "V006", path: "enrollment.yaml", severity: "error" }));
    }
  );

  it("reports every offending enrollment entry with its field and recovery advice", () => {
    const findings = validatePublishedCourse({
      ...publishedCourse,
      enrollment: {
        educators: [42],
        whitelist: null,
        students: [{ name: "Alice" }, { id: "bob" }]
      }
    }).filter((f) => f.rule === "V006");
    expect(findings).toHaveLength(4);
    for (const field of ["educators[0]", "whitelist", "students[0]", "students[1]"]) expect(findings.some((f) => f.message.includes(field))).toBe(true);
    expect(findings.find((f) => f.message.includes("students[0]"))?.message).toContain("name and id");
  });

  it.each(["educators", "whitelist", "students"])("rejects a null %s list", (field) => {
    expect(validatePublishedCourse({ ...publishedCourse, enrollment: { [field]: null } })).toContainEqual(
      expect.objectContaining({ rule: "V006", message: expect.stringContaining("Use []") })
    );
  });

  it("detects an accidentally nested enrollment block", () => {
    expect(validatePublishedCourse({ ...publishedCourse, enrollment: { enrollment: { educators: ["lecturer"] } } })).toContainEqual(
      expect.objectContaining({ rule: "V006", message: expect.stringContaining("nested") })
    );
  });

  it("checks quizzes inside nested units and topics, including hidden content", () => {
    const quiz = { ...publishedCourse, type: "quiz", hide: true, contentMd: "# Quiz\n```quiz\n```", route: "/quiz/sample/unit-1/topic-01/quiz-1" };
    const course = { ...publishedCourse, los: [{ ...publishedCourse, type: "unit", los: [{ ...publishedCourse, type: "topic", los: [quiz] }] }] };
    expect(validatePublishedCourse(course)).toContainEqual(expect.objectContaining({ rule: "V013", path: "tutors.json/los/0/los/0/los/0/contentMd" }));
  });

  it("checks calendar and properties with the same rules as source YAML", () => {
    expect(
      validatePublishedCourse({ ...publishedCourse, calendar: {}, properties: [] })
        .filter((f) => f.rule === "V006")
        .map((f) => f.path)
    ).toEqual(["calendar.yaml", "properties.yaml"]);
  });

  it.each([null, [], {}, { ...publishedCourse, los: [{ type: "topic" }] }])("reports malformed course data without crashing: %j", (course) => {
    expect(validatePublishedCourse(course)).toContainEqual(expect.objectContaining({ rule: "V020", severity: "error" }));
  });
});

describe("browser course fetch", () => {
  const signal = () => new AbortController().signal;
  it("requests only tutors.json without credentials", async () => {
    const fetch = vi.fn(async () => Response.json(publishedCourse));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchPublishedCourse("https://course.test/tutors.json", signal())).toEqual(publishedCourse);
    expect(fetch).toHaveBeenCalledWith("https://course.test/tutors.json", expect.objectContaining({ credentials: "omit", signal: expect.any(AbortSignal) }));
  });
  it.each([404, 500])("explains HTTP %s", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status }))
    );
    await expect(fetchPublishedCourse("https://course.test/tutors.json", signal())).rejects.toThrow(`HTTP ${status}`);
  });
  it("explains an HTML response and a network/CORS failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Not a course</html>"))
    );
    await expect(fetchPublishedCourse("https://course.test/tutors.json", signal())).rejects.toThrow("readable JSON");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    await expect(fetchPublishedCourse("https://course.test/tutors.json", signal())).rejects.toThrow("cross-origin");
  });
  it("rejects an oversized response whether or not the server supplies its size", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { headers: { "content-length": String(21 * 1024 * 1024) } }))
    );
    await expect(fetchPublishedCourse("https://course.test/tutors.json", signal())).rejects.toThrow("20 MB");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(21 * 1024 * 1024)))
    );
    await expect(fetchPublishedCourse("https://course.test/tutors.json", signal())).rejects.toThrow("20 MB");
  });
  it("preserves cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw controller.signal.reason;
      })
    );
    await expect(fetchPublishedCourse("https://course.test/tutors.json", controller.signal)).rejects.toBe(controller.signal.reason);
  });
});
