import { describe, it, expect, beforeEach } from "vitest";
import { MockAuthSession } from "../../support/extended-mocks";

describe("Developer: Authentication Integration", () => {
  let auth: MockAuthSession;

  beforeEach(() => {
    auth = new MockAuthSession();
  });

  it("shall create a session on successful sign in", async () => {
    const result = await auth.signIn("github", { id: "user-1", name: "Alice" });

    expect(result.userId).toBe("user-1");
    expect(result.error).toBeNull();
    expect(auth.isAuthenticated()).toBe(true);
  });

  it("shall clear session on sign out", async () => {
    await auth.signIn("github", { id: "user-1", name: "Alice" });
    expect(auth.isAuthenticated()).toBe(true);

    await auth.signOut();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it("shall detect expired session", async () => {
    await auth.signIn("github", { id: "user-1", name: "Alice" });
    auth.simulateExpiry("user-1");

    const session = auth.getSession("user-1");
    expect(session).toBeDefined();
    expect(session!.expiresAt).toBeLessThan(Date.now());
  });

  it("shall maintain session data across calls", async () => {
    await auth.signIn("github", { id: "user-1", name: "Alice" });
    const session = auth.getSession("user-1");

    expect(session?.userId).toBe("user-1");
    expect(session?.provider).toBe("github");
    expect(session?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("shall handle multiple user sessions", async () => {
    await auth.signIn("github", { id: "user-1", name: "Alice" });
    await auth.signIn("github", { id: "user-2", name: "Bob" });

    expect(auth.getSession("user-1")).toBeDefined();
    expect(auth.getSession("user-2")).toBeDefined();
  });

  it("shall return undefined for unknown session", () => {
    expect(auth.getSession("nonexistent")).toBeUndefined();
  });
});
