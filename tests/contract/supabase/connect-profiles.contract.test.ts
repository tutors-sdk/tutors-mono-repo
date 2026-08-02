import { describe, it, expect } from "vitest";
import { ConnectProfileSchema } from "../support/schemas";
import { validateAgainstSchema, assertSchemaMatch } from "../support/validators";

const validProfile = {
  id: "profile-001",
  github_id: "gh-12345",
  full_name: "Alice Smith",
  avatar_url: "https://avatars.githubusercontent.com/u/12345",
  created_at: "2025-01-15T10:30:00Z",
  updated_at: "2025-06-01T14:00:00Z",
};

describe("tutors-connect-profiles table contract", () => {
  it("valid profile passes schema", () => {
    const result = validateAgainstSchema(validProfile, ConnectProfileSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("bio is optional and can be omitted", () => {
    const result = validateAgainstSchema(validProfile, ConnectProfileSchema);
    expect(result.valid).toBe(true);
  });

  it("bio is accepted when provided", () => {
    const profile = { ...validProfile, bio: "CS student interested in distributed systems" };
    const result = validateAgainstSchema(profile, ConnectProfileSchema);
    expect(result.valid).toBe(true);
  });

  it("email is optional and can be omitted", () => {
    const result = validateAgainstSchema(validProfile, ConnectProfileSchema);
    expect(result.valid).toBe(true);
  });

  it("valid email passes", () => {
    const profile = { ...validProfile, email: "alice@example.com" };
    const result = validateAgainstSchema(profile, ConnectProfileSchema);
    expect(result.valid).toBe(true);
  });

  it("invalid email format fails", () => {
    const profile = { ...validProfile, email: "not-an-email" };
    const result = validateAgainstSchema(profile, ConnectProfileSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("email"))).toBe(true);
  });

  it("avatar_url must be a valid URL", () => {
    const profile = { ...validProfile, avatar_url: "not-a-url" };
    const result = validateAgainstSchema(profile, ConnectProfileSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("avatar_url"))).toBe(true);
  });

  it("missing github_id fails", () => {
    const { github_id, ...profile } = validProfile;
    const result = validateAgainstSchema(profile, ConnectProfileSchema);
    expect(result.valid).toBe(false);
  });

  it("missing updated_at fails", () => {
    const { updated_at, ...profile } = validProfile;
    const result = validateAgainstSchema(profile, ConnectProfileSchema);
    expect(result.valid).toBe(false);
  });

  it("profile with both optional fields passes", () => {
    const profile = {
      ...validProfile,
      bio: "Full-stack developer",
      email: "alice@uni.edu",
    };
    const result = validateAgainstSchema(profile, ConnectProfileSchema);
    expect(result.valid).toBe(true);
  });

  it("assertSchemaMatch returns parsed profile on valid data", () => {
    const parsed = assertSchemaMatch(validProfile, ConnectProfileSchema, "connect profile");
    expect(parsed.full_name).toBe("Alice Smith");
    expect(parsed.avatar_url).toContain("https://");
  });
});
