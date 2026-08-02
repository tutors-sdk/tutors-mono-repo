import { describe, it, expect } from "vitest";
import { ConnectLatestSchema } from "../support/schemas";
import { validateAgainstSchema, validateArray, assertSchemaMatch } from "../support/validators";

const validLatestActivity = {
  id: "latest-001",
  courseid: "cs101-2025",
  github_id: "gh-12345",
  lo_title: "Introduction to Algorithms",
  lo_route: "/cs101/topic-01/lab-01",
  timestamp: "2025-06-01T14:30:00Z",
};

describe("tutors-connect-latest table contract", () => {
  it("valid latest activity passes", () => {
    const result = validateAgainstSchema(validLatestActivity, ConnectLatestSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("lo_img is optional and can be omitted", () => {
    const result = validateAgainstSchema(validLatestActivity, ConnectLatestSchema);
    expect(result.valid).toBe(true);
  });

  it("lo_img is accepted when provided", () => {
    const activity = { ...validLatestActivity, lo_img: "https://example.com/img.png" };
    const result = validateAgainstSchema(activity, ConnectLatestSchema);
    expect(result.valid).toBe(true);
  });

  it("missing lo_title fails", () => {
    const { lo_title, ...activity } = validLatestActivity;
    const result = validateAgainstSchema(activity, ConnectLatestSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("lo_title"))).toBe(true);
  });

  it("missing lo_route fails", () => {
    const { lo_route, ...activity } = validLatestActivity;
    const result = validateAgainstSchema(activity, ConnectLatestSchema);
    expect(result.valid).toBe(false);
  });

  it("timestamp is required", () => {
    const { timestamp, ...activity } = validLatestActivity;
    const result = validateAgainstSchema(activity, ConnectLatestSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("timestamp"))).toBe(true);
  });

  it("missing courseid fails", () => {
    const { courseid, ...activity } = validLatestActivity;
    const result = validateAgainstSchema(activity, ConnectLatestSchema);
    expect(result.valid).toBe(false);
  });

  it("missing github_id fails", () => {
    const { github_id, ...activity } = validLatestActivity;
    const result = validateAgainstSchema(activity, ConnectLatestSchema);
    expect(result.valid).toBe(false);
  });

  it("array of latest activities all valid", () => {
    const activities = [
      validLatestActivity,
      { ...validLatestActivity, id: "latest-002", lo_title: "Data Structures", lo_route: "/cs101/topic-02" },
      { ...validLatestActivity, id: "latest-003", lo_img: "https://example.com/thumb.jpg" },
    ];
    const result = validateArray(activities, ConnectLatestSchema);
    expect(result.valid).toBe(true);
  });

  it("assertSchemaMatch returns parsed data on valid input", () => {
    const parsed = assertSchemaMatch(validLatestActivity, ConnectLatestSchema, "latest activity");
    expect(parsed.lo_title).toBe("Introduction to Algorithms");
    expect(parsed.timestamp).toBe("2025-06-01T14:30:00Z");
  });
});
