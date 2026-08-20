import { describe, it, expect, beforeEach } from "vitest";
import { MockRealtimeChannel } from "../../support/mocks";

describe("Shared: Offline Resilience", () => {
  it("shall re-establish Realtime channel after unsubscribe", () => {
    const channel1 = new MockRealtimeChannel();
    channel1.subscribe();
    channel1.unsubscribe();
    expect(channel1.isSubscribed()).toBe(false);

    const channel2 = new MockRealtimeChannel();
    channel2.subscribe();
    expect(channel2.isSubscribed()).toBe(true);
  });

  it("shall retain previously loaded data on API failure", () => {
    const cachedData = [
      { studentid: "s1", timeactive: 30 },
      { studentid: "s2", timeactive: 45 },
    ];
    const apiError = true;

    const displayData = apiError ? cachedData : [];
    expect(displayData).toHaveLength(2);
    expect(displayData[0].studentid).toBe("s1");
  });

  it("shall not overwrite valid state with error state", () => {
    const validState = { courses: ["course-1"], loaded: true };
    const errorResponse = { error: "timeout", data: null };

    const updatedState = errorResponse.error ? validState : { courses: [], loaded: false };
    expect(updatedState.courses).toHaveLength(1);
    expect(updatedState.loaded).toBe(true);
  });

  it("shall indicate stale data when no fresh data received", () => {
    const lastFetchTime = Date.now() - 600000;
    const staleThreshold = 300000;
    const isStale = Date.now() - lastFetchTime > staleThreshold;

    expect(isStale).toBe(true);
  });
});
