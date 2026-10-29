import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAuthSession } from "../../bdd/support/extended-mocks";

// The analytics timer runs against the real service with its seams mocked: the analytics writer, the
// Supabase helpers, the runes it reads, and the public env (read once, when the service module loads).
const seams = vi.hoisted(() => ({ anonMode: "FALSE", updatePageCount: (() => {}) as (...args: unknown[]) => void }));
vi.mock("$app/env/public", () => ({
  get PUBLIC_ANON_MODE() {
    return seams.anonMode;
  }
}));
vi.mock("$app/env", () => ({ browser: true }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("../../../packages/svelte/community/src/index.ts", () => ({
  analyticsService: { updatePageCount: (...args: unknown[]) => seams.updatePageCount(...args) },
  presenceService: {}
}));
vi.mock("@tutors/community/utils/supabase-client", () => ({}));
vi.mock("../../../packages/svelte/connect/src/services/supabaseProfile.svelte.ts", () => ({ supabaseProfile: {} }));
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(initial: T) => ({ value: initial });
  return {
    currentCourse: rune({ courseId: "cs101" }),
    currentLo: rune({ route: "/lab/cs101/lab-01" }),
    tutorsId: rune({ login: "alice" }),
    isEducator: rune(false)
  };
});
vi.mock("../../../packages/svelte/utils/rbac/src/index.ts", () => ({ rbacService: {} }));

type ConnectService = typeof import("../../../packages/svelte/connect/src/services/connect.svelte.ts").tutorsConnectService;
const loadService = async (anonMode = "FALSE"): Promise<ConnectService> => {
  seams.anonMode = anonMode;
  vi.resetModules();
  return (await import("../../../packages/svelte/connect/src/services/connect.svelte.ts")).tutorsConnectService;
};

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

describe("connect-service: analytics timer", () => {
  const HEARTBEAT = 30 * 1000;
  let service: ConnectService;
  let updates: number;

  beforeEach(async () => {
    updates = 0;
    seams.updatePageCount = () => updates++;
    vi.stubGlobal("document", { hidden: false });
    vi.useFakeTimers();
    service = await loadService();
  });

  afterEach(() => {
    service.stopTimer();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("schedules one heartbeat however many times it is started", () => {
    service.startTimer();
    service.startTimer();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(HEARTBEAT);
    expect(updates).toBe(1);
  });

  it("leaves nothing running after a stop, even after repeated starts", () => {
    service.startTimer();
    service.startTimer();
    service.stopTimer();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2 * HEARTBEAT);
    expect(updates).toBe(0);
  });

  it("is harmless to stop twice and starts afresh once afterwards", () => {
    service.startTimer();
    service.stopTimer();
    service.stopTimer();
    service.startTimer();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(HEARTBEAT);
    expect(updates).toBe(1);
  });

  it("does not accumulate heartbeats across mount and re-mount", () => {
    for (let mount = 0; mount < 3; mount++) {
      service.startTimer();
      service.stopTimer();
    }
    service.startTimer();
    vi.advanceTimersByTime(2 * HEARTBEAT);
    expect(updates).toBe(2);
  });

  it("writes nothing while the document is hidden", () => {
    vi.stubGlobal("document", { hidden: true });
    service.startTimer();
    vi.advanceTimersByTime(2 * HEARTBEAT);
    expect(updates).toBe(0);
  });

  it("schedules nothing in anonymous mode", async () => {
    service = await loadService("TRUE");
    service.startTimer();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2 * HEARTBEAT);
    expect(updates).toBe(0);
  });
});
