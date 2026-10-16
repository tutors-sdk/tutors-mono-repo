import { describe, expect, it } from "vitest";
import { admits, courseAccessReader, courseJsonUrl, educatorsOf, teaches } from "../../../packages/svelte/utils/feedback/src/server/index.ts";

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
    const fetchFn = async (url: string) => {
      fetches++;
      expect(url).toBe("https://cs101.netlify.app/tutors.json");
      return answer({ authLevel: 1, enrollment: { educators: ["ellen"] } })();
    };
    expect(await read("cs101", fetchFn)).toEqual({ authLevel: 1, enrollment: { educators: ["ellen"] } });
    await read("cs101", fetchFn);
    expect(fetches).toBe(1);
    now = 2000;
    await read("cs101", fetchFn);
    expect(fetches).toBe(2);
    expect(await read("gone", answer("", false))).toBeNull();
    expect(await read("broken", answer("{not json"))).toBeNull();
    expect(await read("odd.example.com", answer({}))).toBeNull();
    expect(await read("bare", answer({ enrollment: "x" }))).toEqual({ authLevel: 0, enrollment: null });
  });
});
