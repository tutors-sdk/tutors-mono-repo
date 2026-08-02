import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Catalogue service unit tests.
 *
 * Tests the catalogueService object from community/src/services/catalogue.ts.
 * The Supabase client is mocked via vi.mock so no real database calls are made.
 */

// --- mock Supabase query builder ---

const mockOrder = vi.fn();
const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockIn = vi.fn();
const mockFrom = vi.fn();

/** Resets the mock chain to return successful empty results by default. */
function resetSupabaseMocks() {
  mockIn.mockResolvedValue({ error: null });
  mockDelete.mockReturnValue({ in: mockIn });
  mockOrder.mockResolvedValue({ data: [], error: null });
  mockSelect.mockReturnValue({ order: mockOrder });
  mockFrom.mockReturnValue({
    select: mockSelect,
    delete: mockDelete
  });
}

vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args)
  }
}));

vi.mock("../../../packages/svelte/utils/logger/src/index.ts", () => ({
  default: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    setDefaultLevel: vi.fn()
  }
}));

import { catalogueService } from "../../../packages/svelte/community/src/services/catalogue.ts";
import log from "../../../packages/svelte/utils/logger/src/index.ts";

// --- fixtures ---

function makeCatalogueEntry(overrides: Record<string, unknown> = {}) {
  return {
    course_id: "course-1",
    visited_at: new Date("2026-07-01"),
    visit_count: 5,
    course_record: { title: "Test Course" },
    ...overrides
  };
}

// --- setup ---

beforeEach(() => {
  vi.clearAllMocks();
  resetSupabaseMocks();
});

// =====================================================================
// getCatalogue
// =====================================================================

describe("catalogueService.getCatalogue", () => {
  it("returns an array of catalogue entries on success", async () => {
    const entries = [makeCatalogueEntry(), makeCatalogueEntry({ course_id: "course-2" })];
    mockOrder.mockResolvedValue({ data: entries, error: null });

    const result = await catalogueService.getCatalogue();

    expect(result).toEqual(entries);
  });

  it("queries the correct table with proper ordering", async () => {
    await catalogueService.getCatalogue();

    expect(mockFrom).toHaveBeenCalledWith("tutors-connect-courses");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockOrder).toHaveBeenCalledWith("visited_at", { ascending: false });
  });

  it("returns empty array when Supabase returns an error", async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: "DB down" } });

    const result = await catalogueService.getCatalogue();

    expect(result).toEqual([]);
  });

  it("logs error when Supabase returns an error", async () => {
    const supaError = { message: "DB down" };
    mockOrder.mockResolvedValue({ data: null, error: supaError });

    await catalogueService.getCatalogue();

    expect(log.error).toHaveBeenCalledWith("Error fetching courses:", supaError);
  });

  it("returns empty array when select chain throws", async () => {
    mockOrder.mockRejectedValue(new Error("network timeout"));

    const result = await catalogueService.getCatalogue();

    expect(result).toEqual([]);
  });
});

// =====================================================================
// getCatalogueCount
// =====================================================================

describe("catalogueService.getCatalogueCount", () => {
  it("returns the count on success", async () => {
    mockSelect.mockResolvedValue({ count: 42, error: null });

    const result = await catalogueService.getCatalogueCount();

    expect(result).toBe(42);
  });

  it("queries with exact count and head: true", async () => {
    mockSelect.mockResolvedValue({ count: 0, error: null });

    await catalogueService.getCatalogueCount();

    expect(mockFrom).toHaveBeenCalledWith("tutors-connect-courses");
    expect(mockSelect).toHaveBeenCalledWith("*", { count: "exact", head: true });
  });

  it("returns 0 when count is null", async () => {
    mockSelect.mockResolvedValue({ count: null, error: null });

    const result = await catalogueService.getCatalogueCount();

    expect(result).toBe(0);
  });

  it("returns 0 when Supabase returns an error", async () => {
    mockSelect.mockResolvedValue({ count: null, error: { message: "fail" } });

    const result = await catalogueService.getCatalogueCount();

    expect(result).toBe(0);
  });

  it("logs error on failure", async () => {
    const err = { message: "fail" };
    mockSelect.mockResolvedValue({ count: null, error: err });

    await catalogueService.getCatalogueCount();

    expect(log.error).toHaveBeenCalledWith("Error fetching course count:", err);
  });
});

// =====================================================================
// getStudentCount
// =====================================================================

describe("catalogueService.getStudentCount", () => {
  it("returns the count on success", async () => {
    mockSelect.mockResolvedValue({ count: 100, error: null });

    const result = await catalogueService.getStudentCount();

    expect(result).toBe(100);
  });

  it("queries the tutors-connect-profiles table", async () => {
    mockSelect.mockResolvedValue({ count: 0, error: null });

    await catalogueService.getStudentCount();

    expect(mockFrom).toHaveBeenCalledWith("tutors-connect-profiles");
  });

  it("returns 0 when Supabase returns an error", async () => {
    mockSelect.mockResolvedValue({ count: null, error: { message: "no profiles" } });

    const result = await catalogueService.getStudentCount();

    expect(result).toBe(0);
  });

  it("returns 0 when count is null", async () => {
    mockSelect.mockResolvedValue({ count: null, error: null });

    const result = await catalogueService.getStudentCount();

    expect(result).toBe(0);
  });
});

// =====================================================================
// pruneCatalogue
// =====================================================================

describe("catalogueService.pruneCatalogue", () => {
  it("HEAD-checks each course and deletes dead ones", async () => {
    const entries = [
      makeCatalogueEntry({ course_id: "alive-course" }),
      makeCatalogueEntry({ course_id: "dead-course" })
    ];
    mockOrder.mockResolvedValue({ data: entries, error: null });

    const mockFetch = vi.fn<(...args: any[]) => Promise<Response>>().mockImplementation(async (url: string) => {
      if (url.includes("alive-course")) {
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 404 });
    });

    await catalogueService.pruneCatalogue(mockFetch as any);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockIn).toHaveBeenCalledWith("course_id", ["dead-course"]);
  });

  it("uses HEAD method for course checks", async () => {
    const entries = [makeCatalogueEntry({ course_id: "c1" })];
    mockOrder.mockResolvedValue({ data: entries, error: null });

    const mockFetch = vi.fn<(...args: any[]) => Promise<Response>>().mockResolvedValue(
      new Response(null, { status: 200 })
    );

    await catalogueService.pruneCatalogue(mockFetch as any);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://c1.netlify.app/tutors.json",
      { method: "HEAD" }
    );
  });

  it("treats fetch errors as invalid courses", async () => {
    const entries = [makeCatalogueEntry({ course_id: "error-course" })];
    mockOrder.mockResolvedValue({ data: entries, error: null });

    const mockFetch = vi.fn<(...args: any[]) => Promise<Response>>().mockRejectedValue(
      new Error("network error")
    );

    await catalogueService.pruneCatalogue(mockFetch as any);

    expect(mockIn).toHaveBeenCalledWith("course_id", ["error-course"]);
  });

  it("does not call deleteCourses when all courses are alive", async () => {
    const entries = [
      makeCatalogueEntry({ course_id: "alive-1" }),
      makeCatalogueEntry({ course_id: "alive-2" })
    ];
    mockOrder.mockResolvedValue({ data: entries, error: null });

    const mockFetch = vi.fn<(...args: any[]) => Promise<Response>>().mockResolvedValue(
      new Response(null, { status: 200 })
    );

    await catalogueService.pruneCatalogue(mockFetch as any);

    // delete chain should not have been called via from()
    // mockFrom is called once for getCatalogue; if deleteCourses runs it would be called again
    expect(mockFrom).toHaveBeenCalledTimes(1); // only the getCatalogue call
  });

  it("handles empty catalogue gracefully", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    const mockFetch = vi.fn<(...args: any[]) => Promise<Response>>();

    await catalogueService.pruneCatalogue(mockFetch as any);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("collects multiple dead courses for a single delete call", async () => {
    const entries = [
      makeCatalogueEntry({ course_id: "dead-1" }),
      makeCatalogueEntry({ course_id: "dead-2" }),
      makeCatalogueEntry({ course_id: "dead-3" })
    ];
    mockOrder.mockResolvedValue({ data: entries, error: null });

    const mockFetch = vi.fn<(...args: any[]) => Promise<Response>>().mockResolvedValue(
      new Response(null, { status: 500 })
    );

    await catalogueService.pruneCatalogue(mockFetch as any);

    expect(mockIn).toHaveBeenCalledWith("course_id", ["dead-1", "dead-2", "dead-3"]);
  });
});

// =====================================================================
// deleteCourses
// =====================================================================

describe("catalogueService.deleteCourses", () => {
  it("deletes from the correct table using .in()", async () => {
    await catalogueService.deleteCourses(["c1", "c2"]);

    expect(mockFrom).toHaveBeenCalledWith("tutors-connect-courses");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockIn).toHaveBeenCalledWith("course_id", ["c1", "c2"]);
  });

  it("logs success message after successful deletion", async () => {
    await catalogueService.deleteCourses(["c1"]);

    expect(log.debug).toHaveBeenCalledWith("Successfully deleted 1 courses");
  });

  it("throws and logs when Supabase returns an error", async () => {
    const supaError = { message: "permission denied" };
    mockIn.mockResolvedValue({ error: supaError });

    await expect(catalogueService.deleteCourses(["c1"])).rejects.toEqual(supaError);

    expect(log.error).toHaveBeenCalledWith("Error deleting courses:", supaError);
  });

  it("throws and logs when the delete chain rejects", async () => {
    const networkError = new Error("connection reset");
    mockIn.mockRejectedValue(networkError);

    await expect(catalogueService.deleteCourses(["c1"])).rejects.toThrow("connection reset");

    expect(log.error).toHaveBeenCalledWith("Error in deleteCourses:", networkError);
  });
});
