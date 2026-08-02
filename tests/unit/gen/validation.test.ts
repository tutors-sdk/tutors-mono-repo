import { describe, it, expect } from "vitest";

/**
 * Validation tests for course/LO data.
 *
 * The gen library must produce valid data structures. These tests validate
 * that missing or invalid fields can be detected before the data reaches
 * the Tutors reader.
 */

const VALID_LO_TYPES = [
  "course", "topic", "unit", "side",
  "talk", "lab", "note", "web", "github", "archive",
  "panelvideo", "paneltalk", "panelnote",
  "tutorial", "notebook", "podcast",
];

interface LoFields {
  id?: string | null;
  title?: string | null;
  type?: string | null;
  route?: string;
  summary?: string;
}

function validateLo(lo: LoFields): string[] {
  const errors: string[] = [];

  if (!lo.id) {
    errors.push("missing required field: id");
  }
  if (lo.title === undefined || lo.title === null) {
    errors.push("missing required field: title");
  } else if (lo.title.trim() === "") {
    errors.push("title must not be empty");
  }
  if (!lo.type) {
    errors.push("missing required field: type");
  } else if (!VALID_LO_TYPES.includes(lo.type)) {
    errors.push(`invalid LO type: ${lo.type}`);
  }

  return errors;
}

describe("validation: missing required fields", () => {
  it("detects missing id", () => {
    const errors = validateLo({ title: "Test", type: "note" });
    expect(errors).toContain("missing required field: id");
  });

  it("detects missing title", () => {
    const errors = validateLo({ id: "lo-1", type: "note" });
    expect(errors).toContain("missing required field: title");
  });

  it("detects missing type", () => {
    const errors = validateLo({ id: "lo-1", title: "Test" });
    expect(errors).toContain("missing required field: type");
  });

  it("detects multiple missing fields at once", () => {
    const errors = validateLo({});
    expect(errors).toContain("missing required field: id");
    expect(errors).toContain("missing required field: title");
    expect(errors).toContain("missing required field: type");
    expect(errors).toHaveLength(3);
  });
});

describe("validation: empty title", () => {
  it("rejects an empty title string", () => {
    const errors = validateLo({ id: "lo-1", title: "", type: "note" });
    expect(errors).toContain("title must not be empty");
  });

  it("rejects a whitespace-only title", () => {
    const errors = validateLo({ id: "lo-1", title: "   ", type: "note" });
    expect(errors).toContain("title must not be empty");
  });
});

describe("validation: invalid LO type", () => {
  it("rejects an unknown type string", () => {
    const errors = validateLo({ id: "lo-1", title: "Test", type: "invalid-type" });
    expect(errors).toContain("invalid LO type: invalid-type");
  });

  it("accepts all valid LO types", () => {
    for (const type of VALID_LO_TYPES) {
      const errors = validateLo({ id: "lo-1", title: "Test", type });
      expect(errors).toHaveLength(0);
    }
  });
});

describe("validation: null and undefined handling", () => {
  it("detects null id", () => {
    const errors = validateLo({ id: null, title: "Test", type: "note" });
    expect(errors).toContain("missing required field: id");
  });

  it("detects null title", () => {
    const errors = validateLo({ id: "lo-1", title: null, type: "note" });
    expect(errors).toContain("missing required field: title");
  });

  it("detects null type", () => {
    const errors = validateLo({ id: "lo-1", title: "Test", type: null });
    expect(errors).toContain("missing required field: type");
  });

  it("returns no errors for a fully valid LO", () => {
    const errors = validateLo({ id: "lo-1", title: "Test", type: "note" });
    expect(errors).toHaveLength(0);
  });
});
