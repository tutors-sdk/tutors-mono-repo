import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/reader/src/lib/server/supabase-service.ts", async () => {
  const { recorder } = await import("../../bdd/support/supabase-recorder.ts");
  return { serviceSupabase: () => recorder };
});

import { PUT } from "../../../apps/reader/src/routes/api/courses/[courseid]/locks/+server.ts";
import { recorder } from "../../bdd/support/supabase-recorder.ts";

async function change(enrollment: unknown, locked: boolean, login: string | null = "lecturer") {
  return PUT({
    params: { courseid: "pf1" },
    locals: { actor: login ? { login } : null },
    fetch: vi.fn(async () => Response.json({ enrollment })),
    request: new Request("http://reader.test/api/courses/pf1/locks", {
      method: "PUT",
      body: JSON.stringify({ loRoute: "/topic/pf1/topic-01", locked })
    })
  } as never);
}

beforeEach(() => recorder.reset());

describe.each([true, false])("saving a content lock with locked=%s", (locked) => {
  it.each([{ whitelist: null }, { whitelist: [null] }, { students: null }, { students: [{ name: "Alice", github: "alice" }] }, { students: [{ id: "alice" }] }, {}])(
    "checks the educator independently of student lists: %j",
    async (lists) => {
      const response = await change({ educators: ["lecturer"], ...lists }, locked);
      expect(response.status).toBe(200);
      expect(recorder.rows("tutors_content_locks")).toMatchObject([{ course_id: "pf1", lo_route: "/topic/pf1/topic-01", locked, locked_by: "lecturer" }]);
    }
  );
});

it.each([
  [null, 401],
  ["student", 403]
] as const)("still refuses %s when student lists are invalid", async (login, status) => {
  await expect(change({ educators: ["lecturer"], whitelist: null, students: null }, true, login)).rejects.toMatchObject({ status });
  expect(recorder.tableCalls).toEqual([]);
});

it.each([
  ["lecturer", 502],
  [null, 502],
  [[null], 502],
  [[], 403],
  [undefined, 403]
])("still refuses invalid or missing educators: %j", async (educators, status) => {
  await expect(change({ educators }, true)).rejects.toMatchObject({ status });
  expect(recorder.tableCalls).toEqual([]);
});
