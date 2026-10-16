import { describe, expect, it } from "vitest";
import { MAX_ENROLLMENT_LOGINS, admits, courseAccessReader, courseJsonUrl, educatorsOf, teaches } from "../../../packages/svelte/utils/feedback/src/server/index.ts";

const answer =
  (body: unknown, ok = true) =>
  async () => ({ ok, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

describe("course access for feedback", () => {
  it("reads only a course on Netlify", () => {
    expect(courseJsonUrl("cs101")).toBe("https://cs101.netlify.app/tutors.json");
    expect(courseJsonUrl("CS101.netlify.app")).toBe("https://cs101.netlify.app/tutors.json");
    expect(courseJsonUrl("localhost:3000")).toBeNull();
    expect(courseJsonUrl("internal.example.com")).toBeNull();
    expect(courseJsonUrl("-bad")).toBeNull();
  });

  it("admits anyone to a public course, and a private course's whitelist and educators only", () => {
    const open = { authLevel: 0, enrollment: { educators: ["ellen"], whitelist: ["alice"] } };
    const closed = { authLevel: 1, enrollment: { educators: ["ellen"], whitelist: ["alice"] } };
    expect(admits(open, "mallory")).toBe(true);
    expect(admits(closed, "alice")).toBe(true);
    expect(admits(closed, "ellen")).toBe(true);
    expect(admits(closed, "mallory")).toBe(false);
    expect(admits({ authLevel: 1, enrollment: null }, "mallory")).toBe(true);
    expect(teaches({ authLevel: 0, enrollment: null }, "ellen")).toBe(false);
    expect(educatorsOf({ authLevel: 0, enrollment: { educators: "ellen" as never } })).toEqual([]);
  });

  it("reads tutors.json once in the cache window, and remembers a course it could not read", async () => {
    let now = 0;
    let fetches = 0;
    const read = courseAccessReader({ cacheMs: 1000, nowMs: () => now });
    const fetchFn = async (url: string, init?: { redirect?: "manual" }) => {
      fetches++;
      expect(url).toBe("https://cs101.netlify.app/tutors.json");
      expect(init).toEqual({ redirect: "manual" });
      return answer({ authLevel: 1, enrollment: { educators: ["ellen"] } })();
    };
    expect(await read("cs101", fetchFn)).toEqual({ authLevel: 1, enrollment: { educators: ["ellen"] } });
    await read("cs101", fetchFn);
    expect(fetches).toBe(1);
    now = 2000;
    await read("cs101", fetchFn);
    expect(fetches).toBe(2);
    expect(await read("gone", answer("", false))).toBeNull();
    // A redirect is not followed, so its answer is not ok and the course is not read.
    expect(await read("moved", answer({ authLevel: 0, enrollment: { educators: ["mallory"] } }, false))).toBeNull();
    expect(await read("broken", answer("{not json"))).toBeNull();
    expect(await read("odd.example.com", answer({}))).toBeNull();
    expect(await read("bare", answer({ enrollment: "x" }))).toEqual({ authLevel: 0, enrollment: null });
  });

  it("keeps only the enrollment's capped login lists, and forgets the oldest course past the limit", async () => {
    let fetches = 0;
    const read = courseAccessReader({ maxCourses: 2 });
    const fetchFn = async () => {
      fetches++;
      return answer({
        authLevel: 1,
        enrollment: { educators: ["ellen", 7], whitelist: Array.from({ length: MAX_ENROLLMENT_LOGINS + 5 }, (_, i) => `s${i}`), students: ["huge"] }
      })();
    };
    const access = await read("a", fetchFn);
    expect(access?.enrollment?.educators).toEqual(["ellen"]);
    expect(access?.enrollment?.whitelist).toHaveLength(MAX_ENROLLMENT_LOGINS);
    expect(access?.enrollment).not.toHaveProperty("students");
    await read("b", fetchFn);
    await read("c", fetchFn);
    expect(fetches).toBe(3);
    await read("c", fetchFn);
    expect(fetches).toBe(3);
    await read("a", fetchFn);
    expect(fetches).toBe(4);
  });
});
