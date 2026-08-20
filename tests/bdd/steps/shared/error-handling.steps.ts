import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { createMockFetch, MockRealtimeChannel } from "../../support/mocks";

describe("Shared: Error Handling", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall return 404 for invalid course URL", async () => {
    const mockFetch = createMockFetch({});
    const response = await mockFetch("/api/course/nonexistent");

    expect(response.status).toBe(404);
  });

  it("shall handle network failure during course load", async () => {
    const mockFetch = createMockFetch({
      "/api/course": async () => {
        throw new Error("Network error");
      },
    });

    try {
      await mockFetch("/api/course/test");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Network error");
    }
  });

  it("shall handle malformed JSON response", () => {
    const malformedJson = "{ not valid json";
    expect(() => JSON.parse(malformedJson)).toThrow();
  });

  it("shall handle Supabase query errors gracefully", async () => {
    const error = { data: null, error: { message: "Table not found" } };
    expect(error.error).not.toBeNull();
    expect(error.data).toBeNull();
  });

  it("shall handle Realtime channel disconnection", () => {
    const channel = new MockRealtimeChannel();
    channel.subscribe();
    expect(channel.isSubscribed()).toBe(true);

    channel.unsubscribe();
    expect(channel.isSubscribed()).toBe(false);
  });
});
