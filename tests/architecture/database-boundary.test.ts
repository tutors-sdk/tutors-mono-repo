import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * The database boundary: a table or database function is named only inside the Supabase adapters
 * (@tutors/store-supabase, its server entry, and @tutors/realtime-supabase). Apps, the rings and
 * every other adapter reach stored data through a port or the adapter's functions, so the schema
 * can change, or the database be replaced, by editing those two packages.
 *
 * The published time library still carries its own Supabase source for consumers outside this
 * repository; the time app itself reads through the reader's API (readerTimeSource).
 */
const ADAPTERS = ["packages/adapters/driven/store-supabase/src/", "packages/adapters/driven/realtime-supabase/src/"];
const PUBLISHED = ["packages/jsr/time/src/services/source.ts"];

describe("database boundary", () => {
  it("names tables and database functions only in the Supabase adapters", () => {
    const output = execFileSync(
      "git",
      ["grep", "--untracked", "-l", "-E", String.raw`\.(from|rpc)\(\s*["'` + "`" + String.raw`][A-Za-z_-]+["'` + "`" + String.raw`]\s*[,)]`, "--", "apps/*/src", "packages", ":!**/node_modules/**"],
      { encoding: "utf8" }
    ).trim();
    const files = output ? output.split("\n") : [];
    expect(files.filter((file) => !ADAPTERS.some((adapter) => file.startsWith(adapter)) && !PUBLISHED.includes(file))).toEqual([]);
    // The check is looking at something: the adapters do name tables.
    expect(files.some((file) => file.startsWith(ADAPTERS[0]!))).toBe(true);
  });
});
