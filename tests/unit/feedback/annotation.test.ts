import { describe, expect, it } from "vitest";
import { audienceOf, memoryFeedbackStore, newestFirst, oldestFirst, stepRef } from "../../../packages/svelte/utils/feedback/src/index.ts";

describe("annotations", () => {
  it("names one step only when all its parts are there", () => {
    expect(stepRef(" cs101 ", "/lab/cs101/lab-01", "02")).toEqual({ courseId: "cs101", labRoute: "/lab/cs101/lab-01", stepId: "02" });
    expect(stepRef("cs101", "", "02")).toBeNull();
    expect(stepRef(null, "/lab/x", "02")).toBeNull();
  });

  it("reads one audience", () => {
    expect(audienceOf({ learnerId: " alice " })).toEqual({ kind: "student", learnerId: "alice" });
    expect(audienceOf({ everyone: true })).toEqual({ kind: "everyone" });
    expect(audienceOf({ learnerId: "alice", everyone: true })).toBe("two-audiences");
    expect(audienceOf({})).toBe("no-audience");
  });

  it("orders by time, then by id", () => {
    const rows = [
      { id: "b", createdAt: "1" },
      { id: "a", createdAt: "1" },
      { id: "c", createdAt: "0" }
    ];
    expect([...rows].sort(oldestFirst).map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(newestFirst(rows).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(oldestFirst({ id: "a", createdAt: "1" }, { id: "a", createdAt: "1" })).toBe(0);
  });

  it("the memory store answers null for an annotation it does not hold", async () => {
    const store = memoryFeedbackStore();
    expect(await store.get("x")).toBeNull();
    expect(await store.revoke("x", "t")).toBeNull();
  });
});
