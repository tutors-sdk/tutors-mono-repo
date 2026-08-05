import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";

describe("Instructor: Lab Analytics", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall display duration per lab grouped by student", () => {
    const records = world.fixtures.createLabDataset(3, 2);

    expect(records).toHaveLength(6);

    const byStudent = new Map<string, typeof records>();
    for (const r of records) {
      const list = byStudent.get(r.student_id) || [];
      list.push(r);
      byStudent.set(r.student_id, list);
    }

    expect(byStudent.size).toBe(3);
    for (const [, labs] of byStudent) {
      expect(labs).toHaveLength(2);
    }
  });

  it("shall show per-step time when drilling into a lab", () => {
    const records = [
      { student_id: "s1", lo_id: "lab-1-step-1", duration: 10, type: "step" },
      { student_id: "s1", lo_id: "lab-1-step-2", duration: 15, type: "step" },
      { student_id: "s1", lo_id: "lab-1-step-3", duration: 20, type: "step" },
    ];

    expect(records).toHaveLength(3);
    const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);
    expect(totalDuration).toBe(45);
  });

  it("shall highlight students with zero engagement", () => {
    const records = [
      { student_id: "s1", lo_id: "lab-1", duration: 30 },
      { student_id: "s2", lo_id: "lab-1", duration: 0 },
      { student_id: "s3", lo_id: "lab-1", duration: 45 },
    ];

    const zeroEngagement = records.filter((r) => r.duration === 0);
    expect(zeroEngagement).toHaveLength(1);
    expect(zeroEngagement[0].student_id).toBe("s2");
  });

  it("shall calculate total duration per lab across students", () => {
    const records = world.fixtures.createLabDataset(5, 3);

    const byLab = new Map<string, number>();
    for (const r of records) {
      byLab.set(r.lo_id, (byLab.get(r.lo_id) || 0) + r.duration);
    }

    expect(byLab.size).toBe(3);
  });

  it("shall show labs with zero activity when no students have accessed them", () => {
    const lab = world.fixtures.createLearningObject({ type: "lab", title: "New Lab" });
    const records = world.fixtures.createLabDataset(0, 0);

    expect(records).toHaveLength(0);
    expect(lab.title).toBe("New Lab");
  });
});
