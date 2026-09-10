import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseCourse } from "../../../../packages/jsr/gen/src/tutors";
import { mergeWorkspace } from "../../../../packages/svelte/utils/runtime/src/workspace";
import { MockSupabaseClient } from "../../support/mocks";
import type { Lo, Playground, Topic } from "../../../../packages/jsr/model/src/types/learning-objects";

/**
 * The instructor's two sides of a playground: writing one, and reading what came back.
 *
 * Authoring is checked by building a real course folder, because that is the interface an
 * instructor actually has. Review is checked against the token the reader signs and the
 * policies on the table, because those — not the page — decide who sees whose work.
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

const STORE = "../../../../packages/svelte/community/src/utils/playground-store.ts";
const MIGRATION = path.join(process.cwd(), "supabase/migrations/20260910_create_playground_snapshots.sql");

let scratch = "";
let client: MockSupabaseClient;

function write(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function built(name: string): Playground {
  const [course] = parseCourse(scratch, true);
  const topic = course.los.find((lo: Lo) => lo.type === "topic") as Topic;
  return topic.los.find((lo: Lo) => lo.type === "playground" && lo.route.endsWith(name)) as Playground;
}

/** A token shaped like the one /api/runtime-token signs for a signed-in reader. */
function token(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

/** Load the snapshot store against a reader that answers the token request like this. */
async function storeFor(response: { ok: boolean; body?: unknown }) {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: response.ok, json: async () => response.body }) as unknown as Response)
  );
  return await import(STORE);
}

beforeAll(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-playground-bdd-"));
  write(path.join(scratch, "course.md"), "# Programming\n\nExercises.\n");
  const topic = path.join(scratch, "topic-01-exercises");
  write(path.join(topic, "topic.md"), "# Exercises\n");

  write(path.join(topic, "playground-01-simple", "main.py"), "print('hello')\n");

  const mixed = path.join(topic, "playground-02-mixed");
  write(path.join(mixed, "helper.py"), "def double(n):\n    return n * 2\n");
  write(path.join(mixed, "main.py"), "print(double(21))\n");
  write(path.join(mixed, "data.json"), '{ "answer": 42 }\n');
  write(path.join(mixed, "test_main.py"), "assert double(2) == 4\n");
  write(path.join(mixed, "notes.md"), "Read this first.\n");

  const configured = path.join(topic, "playground-03-configured");
  write(path.join(configured, "exercise.ts"), "export const answer = 42;\n");
  write(path.join(configured, "scaffold.ts"), "export const given = 1;\n");
  write(path.join(configured, "checks.ts"), "console.log(answer);\n");
  write(
    path.join(configured, "playground.yaml"),
    ["runtime: typescript", "entry: exercise.ts", "tests: checks.ts", "packages:", "  - lodash", "readOnly:", "  - scaffold.ts", ""].join("\n")
  );

  const oversized = path.join(topic, "playground-04-oversized");
  write(path.join(oversized, "main.js"), "console.log(1);\n");
  write(path.join(oversized, "huge.js"), `// ${"x".repeat(300 * 1024)}\n`);
});

afterAll(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  client = new MockSupabaseClient();
  client.setTableData("playground_snapshots", []);
  mocks.createClient.mockImplementation(() => client);
});

describe("Instructor: Playground Authoring and Review", () => {
  describe("WHEN the course is built from a folder holding a single Python file", () => {
    it("shall make that file the entry point", () => {
      expect(built("simple").entry).toBe("main.py");
    });

    it("shall choose the run-time from the entry point's extension", () => {
      expect(built("simple").runtime).toBe("python");
      expect(built("oversized").runtime).toBe("javascript");
    });

    it("shall need no configuration file to do so", () => {
      const lo = built("simple");
      expect(lo.files).toHaveLength(1);
      expect(lo.files[0].content).toContain("print('hello')");
    });
  });

  describe("The workspace holds what the exercise needs and nothing else", () => {
    it("shall carry the source and data files into the workspace", () => {
      const paths = built("mixed").files.map((file) => file.path);
      expect(paths).toContain("helper.py");
      expect(paths).toContain("data.json");
    });

    it("shall leave the prose out of it", () => {
      expect(built("mixed").files.map((file) => file.path)).not.toContain("notes.md");
    });

    it("shall list the entry point first", () => {
      expect(built("mixed").files[0].path).toBe("main.py");
    });
  });

  describe("WHEN the course is built from a folder holding a test file", () => {
    it("shall keep the tests out of the student's workspace", () => {
      expect(built("mixed").files.map((file) => file.path)).not.toContain("test_main.py");
    });

    it("shall carry the tests separately so the student can run them", () => {
      expect(built("mixed").tests?.path).toBe("test_main.py");
      expect(built("mixed").tests?.content).toContain("assert double(2) == 4");
    });
  });

  describe("WHERE a playground folder declares a playground.yaml", () => {
    it("shall take the run-time, entry point and packages from it", () => {
      const lo = built("configured");
      expect(lo.runtime).toBe("typescript");
      expect(lo.entry).toBe("exercise.ts");
      expect(lo.packages).toEqual(["lodash"]);
    });

    it("shall treat the file it names as the tests", () => {
      const lo = built("configured");
      expect(lo.tests?.path).toBe("checks.ts");
      expect(lo.files.map((file) => file.path)).not.toContain("checks.ts");
    });

    it("shall mark the files it names as read-only", () => {
      const lo = built("configured");
      expect(lo.files.find((file) => file.path === "scaffold.ts")?.readOnly).toBe(true);
      expect(lo.files.find((file) => file.path === "exercise.ts")?.readOnly).toBeUndefined();
    });
  });

  describe("IF a file in a playground folder is too large to inline", () => {
    it("shall leave it out rather than ship it to every student", () => {
      expect(built("oversized").files.map((file) => file.path)).not.toContain("huge.js");
    });

    it("shall build the rest of the workspace anyway", () => {
      expect(built("oversized").files.map((file) => file.path)).toEqual(["main.js"]);
    });
  });

  describe("WHILE an instructor teaches the course", () => {
    const educatorToken = { ok: true, body: { token: token({ sub: "grace", educator_courses: ["course.test"] }), expiresIn: 3600 } };

    it("shall let them read the submissions for an exercise", async () => {
      const store = await storeFor(educatorToken);
      client.setTableData("playground_snapshots", [
        {
          student_id: "ada",
          student_name: "Ada Lovelace",
          course_id: "course.test",
          lo_id: "lo",
          runtime: "python",
          entry: "main.py",
          files: [{ path: "main.py", content: "print(1)" }],
          last_output: "1\n",
          last_ok: true,
          updated_at: "2026-09-10T09:00:00.000Z"
        }
      ]);

      expect(await store.isCourseEducator("course.test")).toBe(true);
      const submissions = await store.listPlaygroundSnapshots("course.test", "lo");
      expect(submissions.map((snapshot: { studentName: string }) => snapshot.studentName)).toEqual(["Ada Lovelace"]);
    });

    it("shall present a submission with the output the student last saw", async () => {
      const store = await storeFor(educatorToken);
      client.setTableData("playground_snapshots", [
        {
          student_id: "ada",
          student_name: "Ada Lovelace",
          course_id: "course.test",
          lo_id: "lo",
          runtime: "python",
          entry: "main.py",
          files: [{ path: "main.py", content: "print(1)" }],
          last_output: "Traceback: NameError\n",
          last_ok: false,
          updated_at: "2026-09-10T09:00:00.000Z"
        }
      ]);

      const [submission] = await store.listPlaygroundSnapshots("course.test", "lo");
      expect(submission.lastOutput).toContain("NameError");
      expect(submission.lastOk).toBe(false);
      expect(submission.files).toEqual([{ path: "main.py", content: "print(1)" }]);
    });
  });

  describe("IF the page claims a student teaches the course", () => {
    const policies = fs.readFileSync(MIGRATION, "utf8");

    it("shall believe only the claim the reader signed", async () => {
      const store = await storeFor({ ok: true, body: { token: token({ sub: "ada" }), expiresIn: 3600 } });
      expect(await store.isCourseEducator("course.test")).toBe(false);
    });

    it("shall keep the submissions table closed to the anonymous role", () => {
      expect(policies).toContain("ENABLE ROW LEVEL SECURITY");
      expect(policies).not.toMatch(/TO\s+anon/i);
      // Every policy is written against the token's claims rather than the role alone.
      const policyCount = policies.match(/CREATE POLICY/g)?.length ?? 0;
      const claimChecks = policies.match(/auth\.jwt\(\)/g)?.length ?? 0;
      expect(policyCount).toBeGreaterThan(0);
      expect(claimChecks).toBeGreaterThanOrEqual(policyCount);
    });

    it("shall let an instructor read submissions without letting them write any", () => {
      const educatorPolicy = policies.slice(policies.indexOf('CREATE POLICY "educator_snapshot_select"'));
      expect(educatorPolicy).toContain("FOR SELECT");
      expect(educatorPolicy).toContain("educator_courses");
      expect(educatorPolicy).not.toContain("WITH CHECK");
    });
  });

  describe("IF the reader cannot mint a run-time token", () => {
    it("shall offer no handing in at all", async () => {
      const store = await storeFor({ ok: false });
      expect(await store.authedClient("course.test")).toBeNull();
      expect(await store.listPlaygroundSnapshots("course.test", "lo")).toEqual([]);
    });

    it("shall leave the exercise itself working", () => {
      // Nothing about running, saving or sharing a playground goes through Supabase.
      const lo = { type: "playground", runtime: "python", entry: "main.py", files: [{ path: "main.py", content: "print(1)" }] } as Playground;
      expect(mergeWorkspace(lo, null)).toEqual([{ path: "main.py", content: "print(1)" }]);
    });
  });
});
