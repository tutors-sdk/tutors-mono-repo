import { describe, expect, it } from "vitest";
import { SID_STORAGE_KEY, currentSid, dayKey, newSid, opaqueUid, sidDay, type SidStorage } from "@tutors/live-events";

/**
 * The rotating token is the whole privacy model: if it stopped rotating, or
 * could be derived from an identity, every other promise on the dashboard would
 * be false. These tests pin the rotation and the opacity.
 */

function fakeStorage(initial?: string): SidStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key: string, value: string) {
      this.value = value;
    }
  };
}

describe("rotating session token", () => {
  it("is prefixed with the local day it was minted for", () => {
    const now = new Date(2026, 8, 17, 10, 30);
    const sid = newSid(now);
    expect(sid.startsWith(`${dayKey(now)}.`)).toBe(true);
    expect(sidDay(sid)).toBe("2026-09-17");
    expect(sidDay("not-a-token")).toBeUndefined();
  });

  it("is random: two tokens minted in the same second differ", () => {
    const now = new Date(2026, 8, 17, 10, 30);
    expect(newSid(now)).not.toBe(newSid(now));
  });

  it("is reused within the day and replaced on the next one", () => {
    const storage = fakeStorage();
    const monday = new Date(2026, 8, 14, 9, 0);
    const first = currentSid(storage, monday);
    expect(currentSid(storage, new Date(2026, 8, 14, 23, 59))).toBe(first);

    const tuesday = currentSid(storage, new Date(2026, 8, 15, 0, 1));
    expect(tuesday).not.toBe(first);
    expect(sidDay(tuesday)).toBe("2026-09-15");
    expect(storage.value).toBe(tuesday);
  });

  it("stores under one well-known key", () => {
    const storage = fakeStorage();
    currentSid(storage, new Date(2026, 8, 17));
    expect(storage.getItem(SID_STORAGE_KEY)).toBe(storage.value);
  });

  it("hands back a throwaway token rather than throwing when storage is unavailable", () => {
    expect(sidDay(currentSid(null, new Date(2026, 8, 17)))).toBe("2026-09-17");

    const hostile: SidStorage = {
      getItem() {
        throw new Error("cookies blocked");
      },
      setItem() {
        throw new Error("cookies blocked");
      }
    };
    expect(sidDay(currentSid(hostile, new Date(2026, 8, 17)))).toBe("2026-09-17");
  });
});

describe("opaque identifier", () => {
  it("is stable for a login, different across logins, and reveals none of the login", async () => {
    const one = await opaqueUid("aoife");
    const again = await opaqueUid("aoife");
    const other = await opaqueUid("brendan");

    expect(one).toBe(again);
    expect(one).not.toBe(other);
    expect(one).toMatch(/^[0-9a-f]{32}$/);
    expect(one).not.toContain("aoife");
  });

  it("is salted, so two deployments cannot join their counts", async () => {
    expect(await opaqueUid("aoife", "deployment-a")).not.toBe(await opaqueUid("aoife", "deployment-b"));
  });
});
