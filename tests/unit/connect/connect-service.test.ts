import { describe, it, expect } from "vitest";
import { MockAuthSession } from "../../bdd/support/extended-mocks";

/**
 * Connect service tests via MockAuthSession.
 *
 * The connect package manages authentication sessions. These tests validate
 * the MockAuthSession's sign-in, sign-out, session retrieval, and expiry
 * simulation behaviour.
 */

describe("connect-service: signIn", () => {
  it("sets authenticated to true after sign-in", async () => {
    const auth = new MockAuthSession();
    expect(auth.isAuthenticated()).toBe(false);

    await auth.signIn("github", { id: "user-1", name: "Alice" });
    expect(auth.isAuthenticated()).toBe(true);
  });

  it("stores the session with correct userId", async () => {
    const auth = new MockAuthSession();
    const result = await auth.signIn("github", { id: "user-1", name: "Alice" });

    expect(result.userId).toBe("user-1");
    expect(result.error).toBeNull();
  });

  it("stores the provider in the session", async () => {
    const auth = new MockAuthSession();
    await auth.signIn("github", { id: "user-1", name: "Alice" });

    const session = auth.getSession("user-1");
    expect(session?.provider).toBe("github");
  });
});

describe("connect-service: signOut", () => {
  it("clears all sessions and sets authenticated to false", async () => {
    const auth = new MockAuthSession();
    await auth.signIn("github", { id: "user-1", name: "Alice" });
    expect(auth.isAuthenticated()).toBe(true);

    await auth.signOut();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getSession("user-1")).toBeUndefined();
  });
});

describe("connect-service: getSession", () => {
  it("returns stored session data for a valid userId", async () => {
    const auth = new MockAuthSession();
    await auth.signIn("github", { id: "user-1", name: "Alice" });

    const session = auth.getSession("user-1");
    expect(session).toBeDefined();
    expect(session!.userId).toBe("user-1");
    expect(session!.provider).toBe("github");
    expect(typeof session!.expiresAt).toBe("number");
  });

  it("returns undefined for a non-existent userId", () => {
    const auth = new MockAuthSession();
    expect(auth.getSession("nonexistent")).toBeUndefined();
  });
});

describe("connect-service: simulateExpiry", () => {
  it("sets expiresAt to a past timestamp", async () => {
    const auth = new MockAuthSession();
    await auth.signIn("github", { id: "user-1", name: "Alice" });

    auth.simulateExpiry("user-1");
    const session = auth.getSession("user-1");
    expect(session!.expiresAt).toBeLessThan(Date.now());
  });
});

describe("connect-service: multiple sign-ins", () => {
  it("stores separate sessions for different users", async () => {
    const auth = new MockAuthSession();
    await auth.signIn("github", { id: "user-1", name: "Alice" });
    await auth.signIn("github", { id: "user-2", name: "Bob" });

    const session1 = auth.getSession("user-1");
    const session2 = auth.getSession("user-2");
    expect(session1).toBeDefined();
    expect(session2).toBeDefined();
    expect(session1!.userId).toBe("user-1");
    expect(session2!.userId).toBe("user-2");
  });
});
