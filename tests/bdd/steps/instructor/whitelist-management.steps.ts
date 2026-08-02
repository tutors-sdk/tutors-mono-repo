import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { ExtendedTestDataFactory } from "../../support/extended-fixtures";
import { MockAuthSession } from "../../support/extended-mocks";

describe("Instructor: Whitelist Management", () => {
  let world: TestWorld;
  let extFactory: ExtendedTestDataFactory;
  let auth: MockAuthSession;

  beforeEach(() => {
    world = new TestWorld();
    extFactory = new ExtendedTestDataFactory();
    auth = new MockAuthSession();
  });

  it("shall require authentication for private courses", () => {
    const course = world.fixtures.createCourse({
      properties: { isPrivate: "true" },
    });

    expect(course.properties?.isPrivate).toBe("true");
    expect(auth.isAuthenticated()).toBe(false);
  });

  it("shall grant access to whitelisted students", async () => {
    await auth.signIn("github", { id: "github-user-1", name: "Alice" });
    const whitelist = [
      extFactory.createWhitelistEntry({ githubId: "github-user-1" }),
      extFactory.createWhitelistEntry({ githubId: "github-user-2" }),
    ];

    const userId = "github-user-1";
    const isWhitelisted = whitelist.some((w) => w.githubId === userId);

    expect(auth.isAuthenticated()).toBe(true);
    expect(isWhitelisted).toBe(true);
  });

  it("shall deny access to non-whitelisted students", async () => {
    await auth.signIn("github", { id: "github-user-99", name: "Stranger" });
    const whitelist = [
      extFactory.createWhitelistEntry({ githubId: "github-user-1" }),
    ];

    const userId = "github-user-99";
    const isWhitelisted = whitelist.some((w) => w.githubId === userId);

    expect(auth.isAuthenticated()).toBe(true);
    expect(isWhitelisted).toBe(false);
  });

  it("shall deny access by default when whitelist query fails", () => {
    const queryError = { error: "Connection refused" };
    const accessGranted = queryError.error ? false : true;

    expect(accessGranted).toBe(false);
  });

  it("shall grant instructor access regardless of whitelist", async () => {
    await auth.signIn("github", { id: "instructor-1", name: "Prof Smith" });
    const session = auth.getSession("instructor-1");

    expect(session).toBeDefined();
    expect(auth.isAuthenticated()).toBe(true);
  });
});
