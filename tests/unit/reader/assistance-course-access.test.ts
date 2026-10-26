import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetCourseAccess, mayAskIn, parseHelpPost, tutorsJsonUrl } from "../../../apps/reader/src/lib/server/assistance.ts";

describe("the course a help request names", () => {
  beforeEach(() => forgetCourseAccess());

  it("is read only from a Netlify site over https, never a loopback, private or internal host", () => {
    expect(tutorsJsonUrl("cs101")).toBe("https://cs101.netlify.app/tutors.json");
    expect(tutorsJsonUrl("CS101.netlify.app")).toBe("https://CS101.netlify.app/tutors.json");
    for (const id of ["localhost:8080", "192.168.1.10", "127.0.0.1", "intranet.corp", "a/b", "evil.netlify.app.example.com", "-x", "", "x".repeat(64)]) {
      expect(tutorsJsonUrl(id), id).toBeNull();
    }
  });

  it("admits anyone signed in to a public course, only the whitelist and educators to a private one, and nobody to one it cannot read", async () => {
    const site = vi.fn(async (url: string | URL | Request, init?: Parameters<typeof fetch>[1]) => {
      expect(init?.redirect).toBe("manual");
      if (String(url).startsWith("https://open.")) return Response.json({ enrollment: { educators: ["ellen"] } });
      if (String(url).startsWith("https://closed.")) return Response.json({ properties: { auth: 1 }, enrollment: { educators: ["ellen"], whitelist: ["alice", 7] } });
      if (String(url).startsWith("https://down.")) throw new TypeError("fetch failed");
      return new Response(null, { status: 404 });
    });
    const fetchFn = site as unknown as typeof fetch;
    expect(await mayAskIn("open", "bob", fetchFn)).toBe(true);
    expect(await mayAskIn("closed", "alice", fetchFn)).toBe(true);
    expect(await mayAskIn("closed", "ellen", fetchFn)).toBe(true);
    expect(await mayAskIn("closed", "bob", fetchFn)).toBe(false);
    expect(await mayAskIn("gone", "bob", fetchFn)).toBe(false);
    expect(await mayAskIn("down", "bob", fetchFn)).toBe(false);
    expect(await mayAskIn("localhost:5432", "bob", fetchFn)).toBe(false);
    // Read once per course while cached; never for an id the server will not fetch.
    expect(site.mock.calls.map(([url]) => String(url))).toEqual([
      "https://open.netlify.app/tutors.json",
      "https://closed.netlify.app/tutors.json",
      "https://gone.netlify.app/tutors.json",
      "https://down.netlify.app/tutors.json"
    ]);
  });

  it("reads what a browser posts, refusing anything malformed", () => {
    expect(parseHelpPost(null)).toMatch(/JSON object/);
    expect(parseHelpPost({ action: "dance" })).toMatch(/action is one of/);
    expect(parseHelpPost({ action: "request", courseId: "cs101", labRoute: "/lab/other/x", stepId: "02", kind: "stuck" })).toMatch(/lab of the course/);
    expect(parseHelpPost({ action: "request", courseId: "cs101", labRoute: "/lab/cs101/x", stepId: "02" })).toMatch(/kind/);
    expect(parseHelpPost({ action: "request", courseId: "cs101" })).toMatch(/required/);
    expect(parseHelpPost({ action: "resolve" })).toBe("id is required");
    expect(parseHelpPost({ action: "answer-hint", id: "x", hintText: "h".repeat(2001) })).toMatch(/at most 2000/);
    expect(parseHelpPost({ action: "answer-hint", id: "x" })).toEqual({ action: "answer-hint", id: "x", hintText: "" });
  });
});
