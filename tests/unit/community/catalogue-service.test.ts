import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockSupabaseClient, createMockFetch } from "../../bdd/support/mocks";

vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", async () => {
  const { MockSupabaseClient } = await import("../../bdd/support/mocks");
  return { supabase: new MockSupabaseClient() };
});

vi.mock("../../../packages/svelte/utils/logger/src/index.ts", () => ({
  default: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    setDefaultLevel: vi.fn()
  }
}));

import { supabase } from "../../../packages/svelte/community/src/utils/supabase-client.ts";
import { catalogueService } from "../../../packages/svelte/community/src/services/catalogue.ts";
import log from "../../../packages/svelte/utils/logger/src/index.ts";

const mockClient = supabase as unknown as MockSupabaseClient;

function makeCatalogueEntry(overrides: Record<string, unknown> = {}) {
  return {
    course_id: "course-1",
    visited_at: new Date("2026-07-01").toISOString(),
    visit_count: 5,
    course_record: { title: "Test Course" },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.clearAllErrors();
  mockClient.setTableData("tutors-connect-courses", []);
  mockClient.setTableData("tutors-connect-profiles", []);
});

describe("catalogueService.getCatalogue", () => {
  it("returns all catalogue entries ordered by visited_at descending", async () => {
    const older = makeCatalogueEntry({ course_id: "old", visited_at: "2026-01-01T00:00:00Z" });
    const newer = makeCatalogueEntry({ course_id: "new", visited_at: "2026-07-01T00:00:00Z" });
    mockClient.setTableData("tutors-connect-courses", [older, newer]);

    const result = await catalogueService.getCatalogue();

    expect(result).toHaveLength(2);
    expect((result[0] as any).course_id).toBe("new");
    expect((result[1] as any).course_id).toBe("old");
  });

  it("returns empty array when no courses exist", async () => {
    const result = await catalogueService.getCatalogue();

    expect(result).toEqual([]);
  });

  it("returns empty array and logs error when Supabase returns an error", async () => {
    mockClient.setTableError("tutors-connect-courses", { message: "DB down" });

    const result = await catalogueService.getCatalogue();

    expect(result).toEqual([]);
    expect(log.error).toHaveBeenCalledWith("Error fetching courses:", { message: "DB down" });
  });
});

describe("catalogueService.getCatalogueCount", () => {
  it("returns the count of courses", async () => {
    mockClient.setTableData("tutors-connect-courses", [
      makeCatalogueEntry({ course_id: "c1" }),
      makeCatalogueEntry({ course_id: "c2" }),
      makeCatalogueEntry({ course_id: "c3" })
    ]);

    const result = await catalogueService.getCatalogueCount();

    expect(result).toBe(3);
  });

  it("returns 0 when no courses exist", async () => {
    const result = await catalogueService.getCatalogueCount();

    expect(result).toBe(0);
  });

  it("returns 0 and logs error when Supabase returns an error", async () => {
    mockClient.setTableError("tutors-connect-courses", { message: "fail" });

    const result = await catalogueService.getCatalogueCount();

    expect(result).toBe(0);
    expect(log.error).toHaveBeenCalledWith("Error fetching course count:", { message: "fail" });
  });
});

describe("catalogueService.getStudentCount", () => {
  it("returns the count of students", async () => {
    mockClient.setTableData("tutors-connect-profiles", [
      { id: "s1" },
      { id: "s2" }
    ]);

    const result = await catalogueService.getStudentCount();

    expect(result).toBe(2);
  });

  it("returns 0 when no profiles exist", async () => {
    const result = await catalogueService.getStudentCount();

    expect(result).toBe(0);
  });

  it("returns 0 when Supabase returns an error", async () => {
    mockClient.setTableError("tutors-connect-profiles", { message: "no profiles" });

    const result = await catalogueService.getStudentCount();

    expect(result).toBe(0);
  });
});

describe("catalogueService.pruneCatalogue", () => {
  it("removes dead courses from the catalogue", async () => {
    mockClient.setTableData("tutors-connect-courses", [
      makeCatalogueEntry({ course_id: "alive-course" }),
      makeCatalogueEntry({ course_id: "dead-course" })
    ]);

    const mockFetch = createMockFetch({
      "alive-course": async () => new Response(null, { status: 200 }),
      "dead-course": async () => new Response(null, { status: 404 })
    });

    await catalogueService.pruneCatalogue(mockFetch as any);

    const remaining = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].course_id).toBe("alive-course");
  });

  it("does not remove any courses when all are alive", async () => {
    mockClient.setTableData("tutors-connect-courses", [
      makeCatalogueEntry({ course_id: "alive-1" }),
      makeCatalogueEntry({ course_id: "alive-2" })
    ]);

    const mockFetch = createMockFetch({
      "alive-1": async () => new Response(null, { status: 200 }),
      "alive-2": async () => new Response(null, { status: 200 })
    });

    await catalogueService.pruneCatalogue(mockFetch as any);

    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(2);
  });

  it("treats fetch errors as dead courses", async () => {
    mockClient.setTableData("tutors-connect-courses", [
      makeCatalogueEntry({ course_id: "error-course" })
    ]);

    const mockFetch = createMockFetch({
      "error-course": async () => { throw new Error("network error"); }
    });

    await catalogueService.pruneCatalogue(mockFetch as any);

    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(0);
  });

  it("handles empty catalogue gracefully", async () => {
    const mockFetch = vi.fn();

    await catalogueService.pruneCatalogue(mockFetch as any);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("removes multiple dead courses in a single operation", async () => {
    mockClient.setTableData("tutors-connect-courses", [
      makeCatalogueEntry({ course_id: "dead-1" }),
      makeCatalogueEntry({ course_id: "dead-2" }),
      makeCatalogueEntry({ course_id: "dead-3" })
    ]);

    const mockFetch = createMockFetch({
      "dead-1": async () => new Response(null, { status: 500 }),
      "dead-2": async () => new Response(null, { status: 500 }),
      "dead-3": async () => new Response(null, { status: 500 })
    });

    await catalogueService.pruneCatalogue(mockFetch as any);

    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(0);
  });
});

describe("catalogueService.deleteCourses", () => {
  it("removes specified courses from the store", async () => {
    mockClient.setTableData("tutors-connect-courses", [
      makeCatalogueEntry({ course_id: "c1" }),
      makeCatalogueEntry({ course_id: "c2" }),
      makeCatalogueEntry({ course_id: "c3" })
    ]);

    await catalogueService.deleteCourses(["c1", "c2"]);

    const remaining = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].course_id).toBe("c3");
  });

  it("logs success message after deletion", async () => {
    mockClient.setTableData("tutors-connect-courses", [
      makeCatalogueEntry({ course_id: "c1" })
    ]);

    await catalogueService.deleteCourses(["c1"]);

    expect(log.debug).toHaveBeenCalledWith("Successfully deleted 1 courses");
  });

  it("throws and logs when Supabase returns an error", async () => {
    mockClient.setTableError("tutors-connect-courses", { message: "permission denied" });

    await expect(catalogueService.deleteCourses(["c1"])).rejects.toEqual({ message: "permission denied" });

    expect(log.error).toHaveBeenCalledWith("Error deleting courses:", { message: "permission denied" });
  });
});
