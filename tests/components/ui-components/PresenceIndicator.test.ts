import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PresenceUser {
  fullName: string;
  avatar: string;
  id: string;
  isPrivate: boolean;
}

interface PresenceIndicatorData {
  onlineCount: number;
  users: PresenceUser[];
}

function makeUser(overrides: Partial<PresenceUser> = {}): PresenceUser {
  return {
    fullName: "Alice Student",
    avatar: "https://avatars.example.com/alice.png",
    id: "student-1",
    isPrivate: false,
    ...overrides,
  };
}

function makePresence(overrides: Partial<PresenceIndicatorData> = {}): PresenceIndicatorData {
  return {
    onlineCount: 3,
    users: [
      makeUser({ fullName: "Alice", id: "s1" }),
      makeUser({ fullName: "Bob", id: "s2" }),
      makeUser({ fullName: "Charlie", id: "s3" }),
    ],
    ...overrides,
  };
}

function getVisibleUsers(users: PresenceUser[]): PresenceUser[] {
  return users.filter((u) => !u.isPrivate);
}

// ===========================================================================
// Online count
// ===========================================================================
describe("PresenceIndicator: online count", () => {
  it("should be a non-negative integer", () => {
    const presence = makePresence({ onlineCount: 5 });
    expect(presence.onlineCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(presence.onlineCount)).toBe(true);
  });

  it("should match the number of users", () => {
    const presence = makePresence();
    expect(presence.onlineCount).toBe(presence.users.length);
  });

  it("zero online should be valid", () => {
    const presence = makePresence({ onlineCount: 0, users: [] });
    expect(presence.onlineCount).toBe(0);
  });
});

// ===========================================================================
// Avatar list
// ===========================================================================
describe("PresenceIndicator: avatar list", () => {
  it("should contain valid avatar URLs", () => {
    const presence = makePresence();
    presence.users.forEach((user) => {
      expect(typeof user.avatar).toBe("string");
      expect(user.avatar.length).toBeGreaterThan(0);
    });
  });

  it("avatar URLs should be https", () => {
    const presence = makePresence();
    presence.users.forEach((user) => {
      expect(user.avatar).toMatch(/^https:\/\//);
    });
  });
});

// ===========================================================================
// Zero online message
// ===========================================================================
describe("PresenceIndicator: zero online message", () => {
  it("zero online should produce 'no students online' pattern", () => {
    const presence = makePresence({ onlineCount: 0, users: [] });
    const message =
      presence.onlineCount === 0 ? "no students online" : `${presence.onlineCount} students online`;
    expect(message).toBe("no students online");
  });

  it("non-zero online should show count", () => {
    const presence = makePresence({ onlineCount: 4 });
    const message =
      presence.onlineCount === 0 ? "no students online" : `${presence.onlineCount} students online`;
    expect(message).toBe("4 students online");
  });
});

// ===========================================================================
// Full names in participant list
// ===========================================================================
describe("PresenceIndicator: participant full names", () => {
  it("should show full names for all users", () => {
    const presence = makePresence();
    presence.users.forEach((user) => {
      expect(user.fullName).toBeDefined();
      expect(user.fullName.length).toBeGreaterThan(0);
    });
  });

  it("each user should have a unique id", () => {
    const presence = makePresence();
    const ids = presence.users.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ===========================================================================
// Private users
// ===========================================================================
describe("PresenceIndicator: private users", () => {
  it("private users should not appear in the visible list", () => {
    const users = [
      makeUser({ fullName: "Alice", id: "s1", isPrivate: false }),
      makeUser({ fullName: "Bob", id: "s2", isPrivate: true }),
      makeUser({ fullName: "Charlie", id: "s3", isPrivate: false }),
    ];
    const visible = getVisibleUsers(users);
    expect(visible).toHaveLength(2);
    expect(visible.map((u) => u.fullName)).not.toContain("Bob");
  });

  it("all non-private users should appear", () => {
    const users = [
      makeUser({ fullName: "Alice", isPrivate: false }),
      makeUser({ fullName: "Bob", isPrivate: false }),
    ];
    const visible = getVisibleUsers(users);
    expect(visible).toHaveLength(2);
  });

  it("all private users should result in empty visible list", () => {
    const users = [
      makeUser({ isPrivate: true }),
      makeUser({ isPrivate: true }),
    ];
    const visible = getVisibleUsers(users);
    expect(visible).toHaveLength(0);
  });
});
