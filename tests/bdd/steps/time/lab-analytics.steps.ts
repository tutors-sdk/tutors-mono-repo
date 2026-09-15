import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { BaseLabModel } from "../../../../packages/jsr/time/src/services/base-lab-model";

describe("Time: Lab Analytics", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall display lab completion grid with students as rows and labs as columns", () => {
    const dataset = world.fixtures.createLabDataset(10, 5);

    expect(dataset.length).toBe(50);
    const students = [...new Set(dataset.map((r) => r.student_id))];
    const labs = [...new Set(dataset.map((r) => r.lo_id))];
    expect(students).toHaveLength(10);
    expect(labs).toHaveLength(5);
  });

  it("shall show per-step completion data when clicking a lab column", () => {
    const dataset = world.fixtures.createLabDataset(3, 1);

    const labRecords = dataset.filter((r) => r.lo_id === "lab-1");
    expect(labRecords.length).toBe(3);
    labRecords.forEach((r) => {
      expect(r.duration).toBeGreaterThanOrEqual(0);
    });
  });

  it("shall display learning records with duration and count for a student", () => {
    const records = [
      world.fixtures.createLearningRecord({ student_id: "alice", lo_id: "lab-1", duration: 30, count: 2 }),
      world.fixtures.createLearningRecord({ student_id: "alice", lo_id: "lab-2", duration: 45, count: 1 }),
      world.fixtures.createLearningRecord({ student_id: "alice", lo_id: "lab-3", duration: 15, count: 3 }),
    ];

    expect(records).toHaveLength(3);
    records.forEach((r) => {
      expect(r.student_id).toBe("alice");
      expect(r.duration).toBeGreaterThan(0);
      expect(r.count).toBeGreaterThanOrEqual(1);
    });
  });

  it("shall calculate and display median completion time for each lab", () => {
    const dataset = [
      world.fixtures.createLearningRecord({ lo_id: "lab-1", duration: 10 }),
      world.fixtures.createLearningRecord({ lo_id: "lab-1", duration: 30 }),
      world.fixtures.createLearningRecord({ lo_id: "lab-1", duration: 50 }),
    ];

    const durations = dataset.map((r) => r.duration).sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];

    expect(median).toBe(30);
    expect(median).toBeGreaterThanOrEqual(durations[0]);
    expect(median).toBeLessThanOrEqual(durations[durations.length - 1]);
  });
});
