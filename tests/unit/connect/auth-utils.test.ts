import { describe, it, expect } from "vitest";
import { ExtendedTestDataFactory } from "../../bdd/support/extended-fixtures";

/**
 * Auth utils tests via ExtendedTestDataFactory.
 *
 * The connect package requires well-formed AuthSession objects. These tests
 * validate the factory's createAuthSession method and the AuthSession type
 * contract.
 */

describe("auth-utils: createAuthSession returns valid structure", () => {
  it("returns an object with all required AuthSession fields", () => {
    const factory = new ExtendedTestDataFactory();
    const session = factory.createAuthSession();

    expect(session).toHaveProperty("userId");
    expect(session).toHaveProperty("provider");
    expect(session).toHaveProperty("accessToken");
    expect(session).toHaveProperty("expiresAt");
    expect(session).toHaveProperty("user");
    expect(session.user).toHaveProperty("name");
    expect(session.user).toHaveProperty("avatar");
    expect(session.user).toHaveProperty("email");
  });
});

describe("auth-utils: token format", () => {
  it("accessToken is a string", () => {
    const factory = new ExtendedTestDataFactory();
    const session = factory.createAuthSession();
    expect(typeof session.accessToken).toBe("string");
  });

  it("accessToken is non-empty", () => {
    const factory = new ExtendedTestDataFactory();
    const session = factory.createAuthSession();
    expect(session.accessToken.length).toBeGreaterThan(0);
  });
});

describe("auth-utils: expiresAt is in the future", () => {
  it("expiresAt is greater than current time", () => {
    const factory = new ExtendedTestDataFactory();
    const session = factory.createAuthSession();
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it("expiresAt is approximately 1 hour from now", () => {
    const factory = new ExtendedTestDataFactory();
    const before = Date.now();
    const session = factory.createAuthSession();
    const after = Date.now();

    const oneHourMs = 3600000;
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + oneHourMs);
    expect(session.expiresAt).toBeLessThanOrEqual(after + oneHourMs);
  });
});

describe("auth-utils: default provider", () => {
  it("default provider is 'github'", () => {
    const factory = new ExtendedTestDataFactory();
    const session = factory.createAuthSession();
    expect(session.provider).toBe("github");
  });
});

describe("auth-utils: overrides work correctly", () => {
  it("allows overriding userId", () => {
    const factory = new ExtendedTestDataFactory();
    const session = factory.createAuthSession({ userId: "custom-user" });
    expect(session.userId).toBe("custom-user");
  });

  it("allows overriding the user object", () => {
    const factory = new ExtendedTestDataFactory();
    const session = factory.createAuthSession({
      user: { name: "Custom Name", avatar: "https://custom.com/avatar.png", email: "custom@test.com" },
    });
    expect(session.user.name).toBe("Custom Name");
    expect(session.user.email).toBe("custom@test.com");
  });

  it("preserves non-overridden fields when overriding others", () => {
    const factory = new ExtendedTestDataFactory();
    const session = factory.createAuthSession({ userId: "override-user" });
    expect(session.provider).toBe("github");
    expect(session.accessToken).toBe("gho_test_token_abc123");
  });
});
