import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockSupabaseClient } from "../../bdd/support/mocks";

/**
 * The only part of a playground that leaves the browser.
 *
 * Everything here turns on one thing: the reader's token. Without it there is no client,
 * and without a client every call has to fail quietly rather than loudly, because most
 * deployments will never configure this at all.
 */

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
  PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
  PUBLIC_ANON_MODE: "FALSE"
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

vi.mock("@tutors/logger", () => ({
  default: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
}));

const STORE = "../../../packages/svelte/community/src/utils/playground-store.ts";

/** A token shaped like the one /api/runtime-token signs, minus a signature nobody here checks. */
function token(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

let client: MockSupabaseClient;

/** Load the store fresh, so one test's cached token is not another test's starting point. */
async function loadStore(response: { ok: boolean; body?: unknown } = { ok: true, body: { token: token({ sub: "ada" }), expiresIn: 3600 } }) {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: response.ok, json: async () => response.body }) as unknown as Response)
  );
  return await import(STORE);
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new MockSupabaseClient();
  client.setTableData("playground_snapshots", []);
  mocks.createClient.mockImplementation(() => client);
});

describe("authedClient", () => {
  it("acts as the student by putting the reader's token on every request", async () => {
    const store = await loadStore();
    expect(await store.authedClient("course.test")).not.toBeNull();

    const [, , options] = mocks.createClient.mock.calls[0];
    expect(options.global.headers.Authorization).toBe(`Bearer ${token({ sub: "ada" })}`);
  });

  it("does not keep a Supabase session of its own", async () => {
    const store = await loadStore();
    await store.authedClient("course.test");

    const [, , options] = mocks.createClient.mock.calls[0];
    expect(options.auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
  });

  it("asks the reader for a token for the course being opened", async () => {
    const store = await loadStore();
    await store.authedClient("some.course/with spaces");

    expect(fetch).toHaveBeenCalledWith("/api/runtime-token?courseId=some.course%2Fwith%20spaces");
  });

  it("reuses a token rather than minting one per keystroke", async () => {
    const store = await loadStore();
    await store.authedClient("course.test");
    await store.authedClient("course.test");

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("mints a new token when the student moves to another course", async () => {
    const store = await loadStore();
    await store.authedClient("course.one");
    await store.authedClient("course.two");

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("is nothing at all on a deployment with no JWT secret", async () => {
    const store = await loadStore({ ok: false });
    expect(await store.authedClient("course.test")).toBeNull();
  });

  it("is nothing at all when the reader cannot be reached", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );
    const store = await import(STORE);
    expect(await store.authedClient("course.test")).toBeNull();
  });
});

describe("isCourseEducator", () => {
  it("believes the reader's claim rather than anything the page says", async () => {
    const store = await loadStore({ ok: true, body: { token: token({ sub: "ada", educator_courses: ["course.test"] }), expiresIn: 3600 } });
    expect(await store.isCourseEducator("course.test")).toBe(true);
  });

  it("is false for a course the token does not name", async () => {
    const store = await loadStore({ ok: true, body: { token: token({ sub: "ada", educator_courses: ["other.course"] }), expiresIn: 3600 } });
    expect(await store.isCourseEducator("course.test")).toBe(false);
  });

  it("is false for a student, whose token carries no such claim", async () => {
    const store = await loadStore();
    expect(await store.isCourseEducator("course.test")).toBe(false);
  });

  it("is false when there is no token to read", async () => {
    const store = await loadStore({ ok: false });
    expect(await store.isCourseEducator("course.test")).toBe(false);
  });
});

describe("savePlaygroundSnapshot", () => {
  const snapshot = {
    studentId: "ada",
    studentName: "Ada Lovelace",
    courseId: "course.test",
    loId: "/playground/course.test/topic/hello",
    runtime: "python",
    entry: "main.py",
    files: [{ path: "main.py", content: "print(1)" }],
    lastOutput: "1\n",
    lastOk: true
  };

  it("hands in the whole workspace and what it printed", async () => {
    const store = await loadStore();
    expect(await store.savePlaygroundSnapshot(snapshot)).toBe(true);

    const [row] = client.getTableData("playground_snapshots") as Array<Record<string, unknown>>;
    expect(row).toMatchObject({
      student_id: "ada",
      student_name: "Ada Lovelace",
      course_id: "course.test",
      lo_id: "/playground/course.test/topic/hello",
      runtime: "python",
      entry: "main.py",
      last_output: "1\n",
      last_ok: true
    });
    expect(row.files).toEqual([{ path: "main.py", content: "print(1)" }]);
  });

  it("truncates a runaway loop's output rather than posting megabytes of it", async () => {
    const store = await loadStore();
    await store.savePlaygroundSnapshot({ ...snapshot, lastOutput: "x".repeat(50_000) });

    const [row] = client.getTableData("playground_snapshots") as Array<Record<string, unknown>>;
    expect((row.last_output as string).length).toBe(20_000);
  });

  it("says it did not save when there is nowhere to save to", async () => {
    const store = await loadStore({ ok: false });
    expect(await store.savePlaygroundSnapshot(snapshot)).toBe(false);
  });

  it("says it did not save when the database refuses the row", async () => {
    const store = await loadStore();
    client.setTableError("playground_snapshots", { message: "new row violates row-level security policy" });
    expect(await store.savePlaygroundSnapshot(snapshot)).toBe(false);
  });
});

describe("listPlaygroundSnapshots", () => {
  const row = {
    student_id: "ada",
    student_name: "Ada Lovelace",
    course_id: "course.test",
    lo_id: "/playground/course.test/topic/hello",
    runtime: "python",
    entry: "main.py",
    files: [{ path: "main.py", content: "print(1)" }],
    last_output: "1\n",
    last_ok: true,
    updated_at: "2026-09-10T09:00:00.000Z"
  };

  it("reads back what was handed in for one exercise", async () => {
    const store = await loadStore();
    client.setTableData("playground_snapshots", [row]);

    const [snapshot] = await store.listPlaygroundSnapshots("course.test", "/playground/course.test/topic/hello");
    expect(snapshot).toEqual({
      studentId: "ada",
      studentName: "Ada Lovelace",
      courseId: "course.test",
      loId: "/playground/course.test/topic/hello",
      runtime: "python",
      entry: "main.py",
      files: [{ path: "main.py", content: "print(1)" }],
      lastOutput: "1\n",
      lastOk: true,
      updatedAt: "2026-09-10T09:00:00.000Z"
    });
  });

  it("leaves nothing undefined for a row with no name, output or verdict", async () => {
    const store = await loadStore();
    client.setTableData("playground_snapshots", [{ ...row, student_name: null, files: null, last_output: null, last_ok: null }]);

    const [snapshot] = await store.listPlaygroundSnapshots("course.test", "/playground/course.test/topic/hello");
    expect(snapshot).toMatchObject({ studentName: "ada", files: [], lastOutput: "", lastOk: null });
  });

  it("is empty for a reader that cannot mint a token", async () => {
    const store = await loadStore({ ok: false });
    expect(await store.listPlaygroundSnapshots("course.test", "lo")).toEqual([]);
  });

  it("is empty rather than broken when the query is refused", async () => {
    const store = await loadStore();
    client.setTableError("playground_snapshots", { message: "permission denied" });
    expect(await store.listPlaygroundSnapshots("course.test", "lo")).toEqual([]);
  });
});

describe("getPlaygroundSnapshot", () => {
  it("is null for a student who has handed in nothing", async () => {
    const store = await loadStore();
    expect(await store.getPlaygroundSnapshot("course.test", "lo", "ada")).toBeNull();
  });

  it("is null when there is no token", async () => {
    const store = await loadStore({ ok: false });
    expect(await store.getPlaygroundSnapshot("course.test", "lo", "ada")).toBeNull();
  });
});
