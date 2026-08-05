import { describe, it, expect } from "vitest";
import { MockSupabaseClient } from "../../bdd/support/mocks";
import { ExtendedMockSupabaseClient } from "../../bdd/support/extended-mocks";

/**
 * Supabase client mock tests.
 *
 * The community package uses a Supabase client that interacts with 6 tables
 * and 2 RPCs. These tests validate the MockSupabaseClient and
 * ExtendedMockSupabaseClient behaviour to ensure the mock faithfully models
 * the query-builder chain used by the real client.
 */

describe("supabase-client: setTableData and basic select", () => {
  it("returns data that was set via setTableData", async () => {
    const client = new MockSupabaseClient();
    const rows = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }];
    client.setTableData("students", rows);

    const { data } = await client.from("students").select("*");
    expect(data).toEqual(rows);
  });

  it("returns empty array for a table with no data set", async () => {
    const client = new MockSupabaseClient();
    const { data } = await client.from("nonexistent").select("*");
    expect(data).toEqual([]);
  });
});

describe("supabase-client: chained query with eq, order, limit", () => {
  it("filters with eq, orders ascending, and limits results", async () => {
    const client = new MockSupabaseClient();
    client.setTableData("calendar", [
      { studentid: "s1", timeactive: 300, id: "c1" },
      { studentid: "s1", timeactive: 100, id: "c2" },
      { studentid: "s2", timeactive: 200, id: "c3" },
      { studentid: "s1", timeactive: 500, id: "c4" },
    ]);

    const { data } = await client
      .from("calendar")
      .select("*")
      .eq("studentid", "s1")
      .order("timeactive", { ascending: true })
      .limit(2);

    const rows = data as Array<{ studentid: string; timeactive: number }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].timeactive).toBe(100);
    expect(rows[1].timeactive).toBe(300);
    expect(rows.every((r) => r.studentid === "s1")).toBe(true);
  });
});

describe("supabase-client: neq, gte, lte filters", () => {
  it("neq excludes matching rows", async () => {
    const client = new MockSupabaseClient();
    client.setTableData("users", [
      { id: "u1", role: "student" },
      { id: "u2", role: "instructor" },
      { id: "u3", role: "student" },
    ]);

    const { data } = await client.from("users").select("*").neq("role", "instructor");
    const rows = data as Array<{ role: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.role !== "instructor")).toBe(true);
  });

  it("gte returns rows with value >= threshold", async () => {
    const client = new MockSupabaseClient();
    client.setTableData("calendar", [
      { studentid: "s1", timeactive: 50 },
      { studentid: "s2", timeactive: 150 },
      { studentid: "s3", timeactive: 200 },
    ]);

    const { data } = await client.from("calendar").select("*").gte("timeactive", 150);
    const rows = data as Array<{ timeactive: number }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.timeactive >= 150)).toBe(true);
  });

  it("lte returns rows with value <= threshold", async () => {
    const client = new MockSupabaseClient();
    client.setTableData("calendar", [
      { studentid: "s1", timeactive: 50 },
      { studentid: "s2", timeactive: 150 },
      { studentid: "s3", timeactive: 200 },
    ]);

    const { data } = await client.from("calendar").select("*").lte("timeactive", 150);
    const rows = data as Array<{ timeactive: number }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.timeactive <= 150)).toBe(true);
  });
});

describe("supabase-client: single()", () => {
  it("returns the first matching item", async () => {
    const client = new MockSupabaseClient();
    client.setTableData("courses", [
      { id: "c1", title: "Course 1" },
      { id: "c2", title: "Course 2" },
    ]);

    const { data } = await client.from("courses").select("*").eq("id", "c1").single();
    expect(data).toEqual({ id: "c1", title: "Course 1" });
  });

  it("returns null when no rows match", async () => {
    const client = new MockSupabaseClient();
    client.setTableData("courses", [{ id: "c1", title: "Course 1" }]);

    const { data } = await client.from("courses").select("*").eq("id", "nonexistent").single();
    expect(data).toBeNull();
  });
});

describe("supabase-client: RPC via ExtendedMockSupabaseClient", () => {
  it("registers and invokes an RPC handler", async () => {
    const client = new ExtendedMockSupabaseClient();
    client.registerRpc("get_student_count", (params) => {
      return { count: 42, courseId: params.course_id };
    });

    const { data } = await client.rpc("get_student_count", { course_id: "c1" });
    expect(data).toEqual({ count: 42, courseId: "c1" });
  });

  it("returns null data for unregistered RPC", async () => {
    const client = new ExtendedMockSupabaseClient();
    const { data, error } = await client.rpc("unknown_rpc", {});
    expect(data).toBeNull();
    expect(error).toBeNull();
  });
});
