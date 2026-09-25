import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockSupabaseClient } from "../../bdd/support/mocks";

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

// The student count comes from the database's get_student_count(), never from reading profile rows (Rule 0070).
describe("catalogueService.getStudentCount", () => {
  const rpc = vi.fn();
  beforeEach(() => {
    rpc.mockReset();
    (mockClient as unknown as { rpc: typeof rpc }).rpc = rpc;
  });

  it("returns the count the database function reports", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });

    const result = await catalogueService.getStudentCount();

    expect(result).toBe(2);
    expect(rpc).toHaveBeenCalledWith("get_student_count");
  });

  it("returns 0 when no profiles exist", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });

    const result = await catalogueService.getStudentCount();

    expect(result).toBe(0);
  });

  it("returns 0 and logs when the database function fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "no function" } });

    const result = await catalogueService.getStudentCount();

    expect(result).toBe(0);
    expect(log.error).toHaveBeenCalled();
  });
});
