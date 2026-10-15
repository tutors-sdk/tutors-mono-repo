import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Realtime is a port (@tutors/realtime) with adapters. Only the Supabase adapter may drive Supabase
 * Realtime channels, so the gateway's budget, rejoin backoff and counts cover every channel a tab opens.
 * The whiteboard editor is a static page that cannot import workspace packages; it carries the same
 * budget inline until phase 4 (#477) hands it a token through the parent.
 */
const ALLOWED = ["packages/svelte/realtime-supabase/src/index.ts", "apps/reader/static/excalidraw-editor.html"];

describe("realtime boundary", () => {
  it("drives Realtime channels only from the realtime adapter", () => {
    const output = execFileSync(
      "git",
      ["grep", "--untracked", "-l", "-E", String.raw`\.(channel|removeChannel|httpSend|removeAllChannels)\(`, "--", "apps", "packages", ":!**/node_modules/**"],
      { encoding: "utf8" }
    ).trim();
    const files = output ? output.split("\n") : [];
    expect(files.filter((file) => !ALLOWED.includes(file))).toEqual([]);
  });
});
