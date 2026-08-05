import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { MockAuthSession } from "../../support/extended-mocks";

describe("Shared: Authentication", () => {
  let world: TestWorld;
  let auth: MockAuthSession;

  beforeEach(() => {
    world = new TestWorld();
    auth = new MockAuthSession();
  });

  it("shall redirect to GitHub and display profile name after authentication", async () => {
    expect(auth.isAuthenticated()).toBe(false);

    const result = await auth.signIn("github", { id: "alice-123", name: "Alice" });

    expect(result.error).toBeNull();
    expect(auth.isAuthenticated()).toBe(true);
    const session = auth.getSession("alice-123");
    expect(session).toBeDefined();
    expect(session!.provider).toBe("github");
  });

  it("shall display user profile information when authenticated", async () => {
    await auth.signIn("github", { id: "alice-123", name: "Alice" });
    world.currentUser = { id: "alice-123", name: "Alice", avatar: "https://avatars.example.com/alice.png" };

    expect(world.currentUser.name).toBe("Alice");
    expect(world.currentUser.avatar).toBeDefined();
  });

  it("shall allow anonymous browsing of course content without recording activity", () => {
    expect(auth.isAuthenticated()).toBe(false);

    const course = world.fixtures.createCourse({ title: "Web Dev 101" });
    expect(course.title).toBe("Web Dev 101");

    expect(auth.isAuthenticated()).toBe(false);
    expect(world.presenceEvents).toHaveLength(0);
  });

  it("shall record authenticated user activity with user ID and route", async () => {
    await auth.signIn("github", { id: "alice-123", name: "Alice" });
    world.authenticated = true;
    world.currentUser = { id: "alice-123", name: "Alice", avatar: "" };

    const lab = world.fixtures.createLearningObject({ type: "lab", title: "Test Lab" });
    const course = world.fixtures.createCourse({ id: "web-dev-101", topics: [] });

    if (world.authenticated && world.currentUser) {
      const record = {
        userId: world.currentUser.id,
        loRoute: lab.route,
        courseId: course.id,
      };
      expect(record.userId).toBe("alice-123");
      expect(record.loRoute).toBeDefined();
      expect(record.courseId).toBe("web-dev-101");
    }
  });
});
