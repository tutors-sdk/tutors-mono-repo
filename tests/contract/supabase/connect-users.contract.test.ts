import { describe, it, expect } from "vitest";
import { ConnectUserSchema } from "../support/schemas";
import { validateAgainstSchema, assertSchemaMatch } from "../support/validators";

const validUser = {
  id: "user-001",
  github_id: "gh-12345",
  full_name: "Alice Smith",
  avatar_url: "https://avatars.githubusercontent.com/u/12345",
  created_at: "2025-01-15T10:30:00Z",
};

describe("tutors-connect-users table contract", () => {
  it("valid user passes schema", () => {
    const result = validateAgainstSchema(validUser, ConnectUserSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("avatar_url must be a valid URL", () => {
    const result = validateAgainstSchema(validUser, ConnectUserSchema);
    expect(result.valid).toBe(true);
  });

  it("invalid avatar_url fails", () => {
    const user = { ...validUser, avatar_url: "not-a-url" };
    const result = validateAgainstSchema(user, ConnectUserSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("avatar_url"))).toBe(true);
  });

  it("empty string avatar_url fails URL validation", () => {
    const user = { ...validUser, avatar_url: "" };
    const result = validateAgainstSchema(user, ConnectUserSchema);
    expect(result.valid).toBe(false);
  });

  it("missing github_id fails", () => {
    const { github_id, ...user } = validUser;
    const result = validateAgainstSchema(user, ConnectUserSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("github_id"))).toBe(true);
  });

  it("missing full_name fails", () => {
    const { full_name, ...user } = validUser;
    const result = validateAgainstSchema(user, ConnectUserSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("full_name"))).toBe(true);
  });

  it("missing id fails", () => {
    const { id, ...user } = validUser;
    const result = validateAgainstSchema(user, ConnectUserSchema);
    expect(result.valid).toBe(false);
  });

  it("missing created_at fails", () => {
    const { created_at, ...user } = validUser;
    const result = validateAgainstSchema(user, ConnectUserSchema);
    expect(result.valid).toBe(false);
  });

  it("all fields are required (no optional fields)", () => {
    const requiredFields = ["id", "github_id", "full_name", "avatar_url", "created_at"];
    for (const field of requiredFields) {
      const incomplete = { ...validUser };
      delete (incomplete as Record<string, unknown>)[field];
      const result = validateAgainstSchema(incomplete, ConnectUserSchema);
      expect(result.valid).toBe(false);
    }
  });

  it("assertSchemaMatch returns parsed user on valid data", () => {
    const parsed = assertSchemaMatch(validUser, ConnectUserSchema, "connect user");
    expect(parsed.github_id).toBe("gh-12345");
    expect(parsed.full_name).toBe("Alice Smith");
  });

  it("extra fields are stripped by assertSchemaMatch", () => {
    const withExtra = { ...validUser, extra_field: "should-be-stripped" };
    const parsed = assertSchemaMatch(withExtra, ConnectUserSchema, "connect user");
    expect((parsed as Record<string, unknown>).extra_field).toBeUndefined();
  });
});
