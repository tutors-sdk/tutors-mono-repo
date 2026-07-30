import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulates the rune() pattern for testing outside the Svelte compiler.
 * Mirrors the { get value, set value } interface of the real rune().
 */
function rune<T>(initialValue: T): { value: T } {
  let _value = initialValue;
  return {
    get value() {
      return _value;
    },
    set value(v: T) {
      _value = v;
    },
  };
}

interface PresenceUser {
  id: string;
  fullName: string;
  avatar: string;
}

function makeUser(id: string, name: string): PresenceUser {
  return {
    id,
    fullName: name,
    avatar: `https://avatars.example.com/${id}.png`,
  };
}

/** Add a user if not already present (by id). */
function addUser(users: PresenceUser[], user: PresenceUser): PresenceUser[] {
  if (users.some((u) => u.id === user.id)) return users;
  return [...users, user];
}

/** Remove a user by id. */
function removeUser(users: PresenceUser[], userId: string): PresenceUser[] {
  return users.filter((u) => u.id !== userId);
}

// ===========================================================================
// Initialisation
// ===========================================================================
describe("presence-store: initialisation", () => {
  it("should be initializable as empty", () => {
    const studentsOnline = rune<PresenceUser[]>([]);
    expect(studentsOnline.value).toHaveLength(0);
  });

  it("should be initializable with existing users", () => {
    const studentsOnline = rune<PresenceUser[]>([
      makeUser("s1", "Alice"),
      makeUser("s2", "Bob"),
    ]);
    expect(studentsOnline.value).toHaveLength(2);
  });

  it("initial value should be an array", () => {
    const studentsOnline = rune<PresenceUser[]>([]);
    expect(Array.isArray(studentsOnline.value)).toBe(true);
  });
});

// ===========================================================================
// Adding users
// ===========================================================================
describe("presence-store: adding users", () => {
  it("should increase count when a user is added", () => {
    const studentsOnline = rune<PresenceUser[]>([]);
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s1", "Alice"));
    expect(studentsOnline.value).toHaveLength(1);
  });

  it("should reflect the added user data", () => {
    const studentsOnline = rune<PresenceUser[]>([]);
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s1", "Alice"));
    expect(studentsOnline.value[0].fullName).toBe("Alice");
    expect(studentsOnline.value[0].id).toBe("s1");
  });

  it("multiple adds should accumulate", () => {
    const studentsOnline = rune<PresenceUser[]>([]);
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s1", "Alice"));
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s2", "Bob"));
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s3", "Charlie"));
    expect(studentsOnline.value).toHaveLength(3);
  });
});

// ===========================================================================
// Removing users
// ===========================================================================
describe("presence-store: removing users", () => {
  it("should decrease count when a user is removed", () => {
    const studentsOnline = rune<PresenceUser[]>([
      makeUser("s1", "Alice"),
      makeUser("s2", "Bob"),
    ]);
    studentsOnline.value = removeUser(studentsOnline.value, "s1");
    expect(studentsOnline.value).toHaveLength(1);
  });

  it("should remove the correct user", () => {
    const studentsOnline = rune<PresenceUser[]>([
      makeUser("s1", "Alice"),
      makeUser("s2", "Bob"),
    ]);
    studentsOnline.value = removeUser(studentsOnline.value, "s1");
    expect(studentsOnline.value[0].fullName).toBe("Bob");
  });

  it("removing non-existent user should not change list", () => {
    const studentsOnline = rune<PresenceUser[]>([makeUser("s1", "Alice")]);
    studentsOnline.value = removeUser(studentsOnline.value, "s99");
    expect(studentsOnline.value).toHaveLength(1);
  });
});

// ===========================================================================
// Duplicate prevention
// ===========================================================================
describe("presence-store: duplicate prevention", () => {
  it("duplicate user should not double count", () => {
    const studentsOnline = rune<PresenceUser[]>([]);
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s1", "Alice"));
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s1", "Alice"));
    expect(studentsOnline.value).toHaveLength(1);
  });

  it("users with different IDs should both be added", () => {
    const studentsOnline = rune<PresenceUser[]>([]);
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s1", "Alice"));
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s2", "Alice Duplicate"));
    expect(studentsOnline.value).toHaveLength(2);
  });
});

// ===========================================================================
// Clear all
// ===========================================================================
describe("presence-store: clear all", () => {
  it("should reset to empty", () => {
    const studentsOnline = rune<PresenceUser[]>([
      makeUser("s1", "Alice"),
      makeUser("s2", "Bob"),
      makeUser("s3", "Charlie"),
    ]);
    studentsOnline.value = [];
    expect(studentsOnline.value).toHaveLength(0);
  });

  it("clearing empty list should remain empty", () => {
    const studentsOnline = rune<PresenceUser[]>([]);
    studentsOnline.value = [];
    expect(studentsOnline.value).toHaveLength(0);
  });

  it("should be re-populatable after clearing", () => {
    const studentsOnline = rune<PresenceUser[]>([makeUser("s1", "Alice")]);
    studentsOnline.value = [];
    expect(studentsOnline.value).toHaveLength(0);
    studentsOnline.value = addUser(studentsOnline.value, makeUser("s2", "Bob"));
    expect(studentsOnline.value).toHaveLength(1);
    expect(studentsOnline.value[0].fullName).toBe("Bob");
  });
});
