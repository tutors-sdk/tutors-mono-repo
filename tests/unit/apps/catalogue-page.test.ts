import { describe, it, expect, vi } from "vitest";

// The catalogue page's load function over a stub catalogue service.
const rows = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("../../../packages/svelte/community/src/index.ts", () => ({ catalogueService: { getCatalogue: async () => rows.value } }));

import { load } from "../../../apps/catalogue/src/routes/+page.ts";

const loadPage = async () => ((await load({} as Parameters<typeof load>[0])) as { courseRecords: { id: string; title: string }[] }).courseRecords;

describe("catalogue page load", () => {
  it("names each course by its row's course_id when a legacy course_record has no id", async () => {
    rows.value = [
      { course_id: "legacy-a", visited_at: "2026-10-01T00:00:00Z", visit_count: 42, course_record: { title: "A" } },
      { course_id: "legacy-b", visited_at: "2026-10-02T00:00:00Z", visit_count: 30, course_record: { title: "B" } },
      { course_id: "row-id", visited_at: "2026-10-03T00:00:00Z", visit_count: 25, course_record: { id: "record-id", title: "C" } }
    ];
    expect((await loadPage()).map((course) => course.id)).toEqual(["legacy-a", "legacy-b", "record-id"]);
  });
});
