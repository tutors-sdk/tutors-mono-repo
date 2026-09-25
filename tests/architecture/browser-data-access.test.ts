import { describe, expect, it } from "vitest";
import { scanBrowserCode, scanBrowserSource } from "../../scripts/checks/browser-data-access.ts";

describe("browser code reaches personal data only through the data API", () => {
  it("allows public reads, error reports and the aggregate functions", () => {
    const source = `
      supabase.from("tutors-connect-courses").select("*");
      supabase.from("tutors_content_locks").select("id, locked");
      supabase.from("app_errors").insert(rows);
      supabase.rpc("get_student_count");
    `;
    expect(scanBrowserSource("x.ts", source)).toEqual([]);
  });

  it("flags a personal table, a write to a public table and any other RPC", () => {
    const source = [
      'supabase.from("learning_records").select("*");',
      'supabase.from("tutors-connect-courses").upsert(row);',
      'supabase.from("tutors_content_locks")\n  .delete()',
      'supabase.rpc("increment_calendar", {});'
    ].join("\n");
    expect(scanBrowserSource("x.ts", source).map((f) => f.line)).toEqual([1, 2, 3, 5]);
  });

  it("finds nothing in the repository's browser code", () => {
    expect(scanBrowserCode()).toEqual([]);
  });
});
