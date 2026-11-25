import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The course-reader layout owns the analytics heartbeat: it starts the timer when it mounts, so its
 * destroy cleanup must stop it, or each leave and re-enter of the course pages leaves one more interval
 * writing activity (issue #523). The unit tier has no Svelte component harness, so this reads the
 * layout's script and checks the start is paired with a stop in the same `onDestroy`.
 */
const layout = readFileSync(resolve(__dirname, "../../../apps/reader/src/routes/(course-reader)/+layout.svelte"), "utf8");

describe("course-reader layout: analytics timer lifecycle", () => {
  it("starts the analytics timer once", () => {
    expect(layout.match(/tutorsConnectService\.startTimer\(\)/g)).toHaveLength(1);
  });

  it("stops the analytics timer and the presence listener when it is destroyed", () => {
    const cleanup = layout.match(/onDestroy\(\(\) => \{([\s\S]*?)\}\);/)?.[1] ?? "";
    expect(cleanup).toContain("tutorsConnectService.stopTimer()");
    expect(cleanup).toContain("presenceService.stopPresenceListener()");
  });
});
