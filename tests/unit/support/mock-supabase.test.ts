import { describe, it, expect, beforeEach } from "vitest";
import { MockSupabaseClient } from "../../bdd/support/mocks";

let client: MockSupabaseClient;

beforeEach(() => {
  client = new MockSupabaseClient();
});

describe("MockSupabaseClient: select queries", () => {
  it("returns all rows from a seeded table", async () => {
    client.setTableData("courses", [
      { id: "c1", title: "Course 1" },
      { id: "c2", title: "Course 2" }
    ]);

    const { data, error } = await client.from("courses").select("*");

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it("returns empty array for unseeded table", async () => {
    const { data, error } = await client.from("empty").select("*");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("filters with eq", async () => {
    client.setTableData("courses", [
      { id: "c1", title: "Course 1" },
      { id: "c2", title: "Course 2" }
    ]);

    const { data } = await client.from("courses").select("*").eq("id", "c1");

    expect(data).toHaveLength(1);
    expect((data as any[])[0].title).toBe("Course 1");
  });

  it("filters with neq", async () => {
    client.setTableData("courses", [
      { id: "c1", title: "A" },
      { id: "c2", title: "B" },
      { id: "c3", title: "C" }
    ]);

    const { data } = await client.from("courses").select("*").neq("id", "c2");

    expect(data).toHaveLength(2);
  });

  it("filters with in", async () => {
    client.setTableData("courses", [
      { id: "c1" },
      { id: "c2" },
      { id: "c3" }
    ]);

    const { data } = await client.from("courses").select("*").in("id", ["c1", "c3"]);

    expect(data).toHaveLength(2);
  });

  it("orders ascending", async () => {
    client.setTableData("courses", [
      { id: "c2", rank: 2 },
      { id: "c1", rank: 1 },
      { id: "c3", rank: 3 }
    ]);

    const { data } = await client.from("courses").select("*").order("rank", { ascending: true });

    expect((data as any[])[0].id).toBe("c1");
    expect((data as any[])[2].id).toBe("c3");
  });

  it("orders descending", async () => {
    client.setTableData("courses", [
      { id: "c1", rank: 1 },
      { id: "c2", rank: 2 }
    ]);

    const { data } = await client.from("courses").select("*").order("rank", { ascending: false });

    expect((data as any[])[0].id).toBe("c2");
  });

  it("applies limit", async () => {
    client.setTableData("courses", [{ id: "c1" }, { id: "c2" }, { id: "c3" }]);

    const { data } = await client.from("courses").select("*").limit(2);

    expect(data).toHaveLength(2);
  });

  it("chains eq + order + limit", async () => {
    client.setTableData("records", [
      { course: "c1", score: 90 },
      { course: "c1", score: 70 },
      { course: "c2", score: 80 },
      { course: "c1", score: 50 }
    ]);

    const { data } = await client
      .from("records")
      .select("*")
      .eq("course", "c1")
      .order("score", { ascending: false })
      .limit(2);

    expect(data).toHaveLength(2);
    expect((data as any[])[0].score).toBe(90);
    expect((data as any[])[1].score).toBe(70);
  });
});

describe("MockSupabaseClient: single and maybeSingle", () => {
  it("single returns the matching row", async () => {
    client.setTableData("users", [{ id: "u1", name: "Alice" }]);

    const { data, error } = await client.from("users").select("*").eq("id", "u1").single();

    expect(error).toBeNull();
    expect((data as any).name).toBe("Alice");
  });

  it("single returns PGRST116 error when no row matches", async () => {
    client.setTableData("users", [{ id: "u1" }]);

    const { data, error } = await client.from("users").select("*").eq("id", "u999").single();

    expect(data).toBeNull();
    expect((error as any).code).toBe("PGRST116");
  });

  it("maybeSingle returns null data with no error when no row matches", async () => {
    client.setTableData("users", [{ id: "u1" }]);

    const { data, error } = await client.from("users").select("*").eq("id", "u999").maybeSingle();

    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it("maybeSingle returns the row when it matches", async () => {
    client.setTableData("users", [{ id: "u1", name: "Bob" }]);

    const { data, error } = await client.from("users").select("*").eq("id", "u1").maybeSingle();

    expect(error).toBeNull();
    expect((data as any).name).toBe("Bob");
  });
});

describe("MockSupabaseClient: count queries", () => {
  it("returns count when head is true", async () => {
    client.setTableData("courses", [{ id: "c1" }, { id: "c2" }, { id: "c3" }]);

    const { count, error } = await client
      .from("courses")
      .select("*", { count: "exact", head: true }) as any;

    expect(error).toBeNull();
    expect(count).toBe(3);
  });

  it("returns 0 count for empty table", async () => {
    const { count } = await client
      .from("empty")
      .select("*", { count: "exact", head: true }) as any;

    expect(count).toBe(0);
  });
});

describe("MockSupabaseClient: upsert", () => {
  it("inserts a new row", async () => {
    client.setTableData("courses", []);

    await client.from("courses").upsert(
      { course_id: "c1", title: "New Course", visit_count: 1 },
      { onConflict: "course_id" }
    );

    const store = client.getTableData("courses") as any[];
    expect(store).toHaveLength(1);
    expect(store[0].title).toBe("New Course");
  });

  it("updates existing row on conflict", async () => {
    client.setTableData("courses", [
      { course_id: "c1", title: "Old Title", visit_count: 5 }
    ]);

    await client.from("courses").upsert(
      { course_id: "c1", title: "New Title", visit_count: 6 },
      { onConflict: "course_id" }
    );

    const store = client.getTableData("courses") as any[];
    expect(store).toHaveLength(1);
    expect(store[0].title).toBe("New Title");
    expect(store[0].visit_count).toBe(6);
  });

  it("appends without onConflict", async () => {
    client.setTableData("courses", [{ course_id: "c1" }]);

    await client.from("courses").upsert({ course_id: "c2" });

    const store = client.getTableData("courses") as any[];
    expect(store).toHaveLength(2);
  });
});

describe("MockSupabaseClient: delete", () => {
  it("removes matching rows via in()", async () => {
    client.setTableData("courses", [
      { course_id: "c1" },
      { course_id: "c2" },
      { course_id: "c3" }
    ]);

    await client.from("courses").delete().in("course_id", ["c1", "c3"]);

    const store = client.getTableData("courses") as any[];
    expect(store).toHaveLength(1);
    expect(store[0].course_id).toBe("c2");
  });

  it("does nothing when no rows match", async () => {
    client.setTableData("courses", [{ course_id: "c1" }]);

    await client.from("courses").delete().in("course_id", ["c999"]);

    expect(client.getTableData("courses")).toHaveLength(1);
  });
});

describe("MockSupabaseClient: update", () => {
  it("updates matching rows", async () => {
    client.setTableData("records", [
      { student_id: "s1", course_id: "c1", duration: 5 },
      { student_id: "s1", course_id: "c2", duration: 3 },
      { student_id: "s2", course_id: "c1", duration: 7 }
    ]);

    await client
      .from("records")
      .update({ duration: 10 })
      .eq("student_id", "s1")
      .eq("course_id", "c1");

    const store = client.getTableData("records") as any[];
    const updated = store.find((r: any) => r.student_id === "s1" && r.course_id === "c1");
    const untouched = store.find((r: any) => r.student_id === "s2");
    expect(updated.duration).toBe(10);
    expect(untouched.duration).toBe(7);
  });
});

describe("MockSupabaseClient: error injection", () => {
  it("returns injected error from select", async () => {
    client.setTableData("courses", [{ id: "c1" }]);
    client.setTableError("courses", { message: "DB down" });

    const { data, error } = await client.from("courses").select("*");

    expect(data).toBeNull();
    expect((error as any).message).toBe("DB down");
  });

  it("returns injected error from upsert", async () => {
    client.setTableError("courses", { message: "permission denied" });

    const result = await client.from("courses").upsert({ id: "c1" }) as any;

    expect(result.error.message).toBe("permission denied");
  });

  it("clearTableError restores normal behavior", async () => {
    client.setTableData("courses", [{ id: "c1" }]);
    client.setTableError("courses", { message: "fail" });
    client.clearTableError("courses");

    const { data, error } = await client.from("courses").select("*");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("clearAllErrors clears all table errors", async () => {
    client.setTableError("courses", { message: "fail" });
    client.setTableError("users", { message: "fail" });
    client.clearAllErrors();

    const { error: e1 } = await client.from("courses").select("*");
    const { error: e2 } = await client.from("users").select("*");

    expect(e1).toBeNull();
    expect(e2).toBeNull();
  });
});

describe("MockSupabaseClient: getTableData", () => {
  it("reflects mutations from upsert", async () => {
    client.setTableData("t", []);

    await client.from("t").upsert({ id: "r1", val: "a" }, { onConflict: "id" });

    expect(client.getTableData("t")).toEqual([{ id: "r1", val: "a" }]);
  });

  it("reflects mutations from delete", async () => {
    client.setTableData("t", [{ id: "r1" }, { id: "r2" }]);

    await client.from("t").delete().in("id", ["r1"]);

    expect(client.getTableData("t")).toEqual([{ id: "r2" }]);
  });
});
