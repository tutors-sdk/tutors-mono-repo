import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
  PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
  PUBLIC_ANON_MODE: ""
}));

// Hoisted: `vi.mock` factories are lifted above the imports, so the object
// they close over has to be created up there too.
const dynamicEnv = vi.hoisted(
  () => ({ PRIVATE_SUPABASE_SERVICE_KEY: "mock-service-key" }) as Record<string, string | undefined>
);
vi.mock("$env/dynamic/private", () => ({ env: dynamicEnv }));

vi.mock("@tutors/logger", () => ({
  default: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
}));

import {
  requireEducator,
  serviceClient,
  __clearEducatorCache
} from "../../../apps/time/src/lib/server/educator";
import type { RequestEvent } from "@sveltejs/kit";

/**
 * Authorisation gate for the educator snippet dashboard (issue #155).
 *
 * This is the only thing standing in front of the service-role key, which
 * bypasses RLS entirely — `course_gists` has no policies, so if this function
 * says yes the caller reads every active snippet in the course. The tests that
 * matter most here are the negative ones.
 */

const COURSE = "cs101-2025";

/** Builds a RequestEvent stub with a chosen session and tutors.json response. */
function makeEvent(opts: {
  login?: string | null;
  json?: unknown;
  ok?: boolean;
  status?: number;
  throws?: boolean;
}): { event: RequestEvent; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn(async () => {
    if (opts.throws) throw new Error("network down");
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => opts.json ?? {}
    } as Response;
  });

  const event = {
    locals: {
      auth: async () => (opts.login ? { user: { login: opts.login } } : null)
    },
    fetch: fetchMock
  } as unknown as RequestEvent;

  return { event, fetchMock };
}

const withEducators = (...educators: string[]) => ({ enrollment: { educators } });

beforeEach(() => {
  __clearEducatorCache();
  dynamicEnv.PRIVATE_SUPABASE_SERVICE_KEY = "mock-service-key";
});

describe("requireEducator", () => {
  it("authorises a login listed in the course enrollment", async () => {
    const { event } = makeEvent({ login: "lgriffin", json: withEducators("lgriffin", "someone") });
    expect(await requireEducator(event, COURSE)).toEqual({ ok: true, login: "lgriffin" });
  });

  it("rejects an anonymous caller without even reading the course", async () => {
    const { event, fetchMock } = makeEvent({ login: null, json: withEducators("lgriffin") });
    expect(await requireEducator(event, COURSE)).toEqual({ ok: false, reason: "anonymous" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a signed-in student who is not an educator", async () => {
    const { event } = makeEvent({ login: "student1", json: withEducators("lgriffin") });
    expect(await requireEducator(event, COURSE)).toEqual({ ok: false, reason: "not-educator" });
  });

  it("is case-sensitive on the login (no accidental widening)", async () => {
    const { event } = makeEvent({ login: "LGriffin", json: withEducators("lgriffin") });
    expect((await requireEducator(event, COURSE)).ok).toBe(false);
  });

  describe("fails closed", () => {
    it("denies when the course has no enrollment block", async () => {
      const { event } = makeEvent({ login: "lgriffin", json: { title: "A course" } });
      expect(await requireEducator(event, COURSE)).toEqual({ ok: false, reason: "no-enrollment" });
    });

    it("denies when the educators list is empty", async () => {
      const { event } = makeEvent({ login: "lgriffin", json: withEducators() });
      expect(await requireEducator(event, COURSE)).toEqual({ ok: false, reason: "no-enrollment" });
    });

    it("denies when tutors.json 404s", async () => {
      const { event } = makeEvent({ login: "lgriffin", ok: false, status: 404 });
      expect(await requireEducator(event, COURSE)).toEqual({ ok: false, reason: "no-enrollment" });
    });

    it("denies when the fetch throws", async () => {
      const { event } = makeEvent({ login: "lgriffin", throws: true });
      expect(await requireEducator(event, COURSE)).toEqual({ ok: false, reason: "no-enrollment" });
    });

    it("denies when tutors.json is malformed", async () => {
      const { event } = makeEvent({ login: "lgriffin", json: { enrollment: "not-an-object" } });
      expect((await requireEducator(event, COURSE)).ok).toBe(false);
    });
  });

  describe("course id resolution", () => {
    it("resolves a bare course id to its netlify origin", async () => {
      const { event, fetchMock } = makeEvent({ login: "lgriffin", json: withEducators("lgriffin") });
      await requireEducator(event, "cs101-2025");
      expect(fetchMock).toHaveBeenCalledWith("https://cs101-2025.netlify.app/tutors.json");
    });

    it("resolves a bare domain over https", async () => {
      const { event, fetchMock } = makeEvent({ login: "lgriffin", json: withEducators("lgriffin") });
      await requireEducator(event, "course.example.com");
      expect(fetchMock).toHaveBeenCalledWith("https://course.example.com/tutors.json");
    });

    it("resolves localhost over http", async () => {
      const { event, fetchMock } = makeEvent({ login: "lgriffin", json: withEducators("lgriffin") });
      await requireEducator(event, "localhost:5173");
      expect(fetchMock).toHaveBeenCalledWith("http://localhost:5173/tutors.json");
    });
  });

  describe("caching", () => {
    it("reads tutors.json once for repeated checks on the same course", async () => {
      const { event, fetchMock } = makeEvent({ login: "lgriffin", json: withEducators("lgriffin") });
      await requireEducator(event, COURSE);
      await requireEducator(event, COURSE);
      await requireEducator(event, COURSE);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("caches a denial too, so a broken fetch is not retried per request", async () => {
      const { event, fetchMock } = makeEvent({ login: "lgriffin", throws: true });
      await requireEducator(event, COURSE);
      await requireEducator(event, COURSE);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("keeps courses separate", async () => {
      const a = makeEvent({ login: "lgriffin", json: withEducators("lgriffin") });
      const b = makeEvent({ login: "lgriffin", json: withEducators("someone-else") });
      expect((await requireEducator(a.event, "course-a")).ok).toBe(true);
      expect((await requireEducator(b.event, "course-b")).ok).toBe(false);
    });

    it("does not cache the authorisation decision, only the educator list", async () => {
      const educators = withEducators("lgriffin");
      const first = makeEvent({ login: "lgriffin", json: educators });
      expect((await requireEducator(first.event, COURSE)).ok).toBe(true);

      // Same course, different user, list served from cache — must be re-evaluated.
      const second = makeEvent({ login: "student1", json: educators });
      expect(await requireEducator(second.event, COURSE)).toEqual({
        ok: false,
        reason: "not-educator"
      });
      expect(second.fetchMock).not.toHaveBeenCalled();
    });
  });
});

describe("serviceClient", () => {
  it("throws rather than falling back when the service key is absent", () => {
    dynamicEnv.PRIVATE_SUPABASE_SERVICE_KEY = undefined;
    // Must not silently degrade to the anon key: the table is closed to anon,
    // so a fallback would turn a config error into a confusing empty dashboard.
    expect(() => serviceClient()).toThrow(/not configured/i);
  });

  it("builds a client when configured", () => {
    expect(serviceClient()).toBeTruthy();
  });
});
