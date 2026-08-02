import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Breadcrumb {
  title: string;
  route: string;
}

interface NavigatorData {
  breadcrumbs: Breadcrumb[];
  currentRoute: string;
}

function makeNavigator(overrides: Partial<NavigatorData> = {}): NavigatorData {
  return {
    breadcrumbs: [
      { title: "Course Home", route: "/" },
      { title: "Week 3", route: "/topic/week-3" },
      { title: "Lab 01", route: "/lab/lab-01" },
    ],
    currentRoute: "/lab/lab-01",
    ...overrides,
  };
}

function getParentRoute(breadcrumbs: Breadcrumb[]): string | undefined {
  if (breadcrumbs.length < 2) return undefined;
  return breadcrumbs[breadcrumbs.length - 2].route;
}

// ===========================================================================
// Breadcrumb trail ordering
// ===========================================================================
describe("Navigator: breadcrumb trail ordering", () => {
  it("should be ordered from course to current", () => {
    const nav = makeNavigator();
    expect(nav.breadcrumbs[0].title).toBe("Course Home");
    expect(nav.breadcrumbs[nav.breadcrumbs.length - 1].title).toBe("Lab 01");
  });

  it("first breadcrumb should be the course root", () => {
    const nav = makeNavigator();
    expect(nav.breadcrumbs[0].route).toBe("/");
  });

  it("last breadcrumb should match the current route", () => {
    const nav = makeNavigator();
    const last = nav.breadcrumbs[nav.breadcrumbs.length - 1];
    expect(last.route).toBe(nav.currentRoute);
  });

  it("breadcrumbs should maintain hierarchy depth order", () => {
    const nav = makeNavigator({
      breadcrumbs: [
        { title: "Course Home", route: "/" },
        { title: "Week 3", route: "/topic/week-3" },
        { title: "Lab 01", route: "/topic/week-3/lab/lab-01" },
      ],
      currentRoute: "/topic/week-3/lab/lab-01",
    });
    // Each route should be progressively deeper or equal
    for (let i = 1; i < nav.breadcrumbs.length; i++) {
      expect(nav.breadcrumbs[i].route.length).toBeGreaterThanOrEqual(
        nav.breadcrumbs[i - 1].route.length
      );
    }
  });
});

// ===========================================================================
// Title and route on each breadcrumb
// ===========================================================================
describe("Navigator: breadcrumb title and route", () => {
  it("each breadcrumb should have a title", () => {
    const nav = makeNavigator();
    nav.breadcrumbs.forEach((bc) => {
      expect(bc.title).toBeDefined();
      expect(bc.title.length).toBeGreaterThan(0);
    });
  });

  it("each breadcrumb should have a route", () => {
    const nav = makeNavigator();
    nav.breadcrumbs.forEach((bc) => {
      expect(bc.route).toBeDefined();
      expect(typeof bc.route).toBe("string");
    });
  });
});

// ===========================================================================
// Back button (parent route)
// ===========================================================================
describe("Navigator: back button (parent route)", () => {
  it("should point to the second-to-last breadcrumb route", () => {
    const nav = makeNavigator();
    const parentRoute = getParentRoute(nav.breadcrumbs);
    expect(parentRoute).toBe("/topic/week-3");
  });

  it("should return undefined for single-level breadcrumb", () => {
    const nav = makeNavigator({
      breadcrumbs: [{ title: "Home", route: "/" }],
    });
    const parentRoute = getParentRoute(nav.breadcrumbs);
    expect(parentRoute).toBeUndefined();
  });

  it("should return root for two-level breadcrumb", () => {
    const nav = makeNavigator({
      breadcrumbs: [
        { title: "Home", route: "/" },
        { title: "Topics", route: "/topics" },
      ],
    });
    const parentRoute = getParentRoute(nav.breadcrumbs);
    expect(parentRoute).toBe("/");
  });
});

// ===========================================================================
// Root breadcrumb
// ===========================================================================
describe("Navigator: root breadcrumb", () => {
  it("root breadcrumb should link to course home", () => {
    const nav = makeNavigator();
    const root = nav.breadcrumbs[0];
    expect(root.route).toBe("/");
  });

  it("root should have a meaningful title", () => {
    const nav = makeNavigator();
    expect(nav.breadcrumbs[0].title.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Single-level breadcrumb
// ===========================================================================
describe("Navigator: single-level breadcrumb", () => {
  it("should still render with one breadcrumb", () => {
    const nav = makeNavigator({
      breadcrumbs: [{ title: "Course Home", route: "/" }],
      currentRoute: "/",
    });
    expect(nav.breadcrumbs).toHaveLength(1);
    expect(nav.breadcrumbs[0].title).toBe("Course Home");
  });

  it("single breadcrumb should be both root and current", () => {
    const nav = makeNavigator({
      breadcrumbs: [{ title: "Home", route: "/" }],
      currentRoute: "/",
    });
    expect(nav.breadcrumbs[0].route).toBe(nav.currentRoute);
  });

  it("empty breadcrumbs should be handled", () => {
    const nav = makeNavigator({ breadcrumbs: [] });
    expect(nav.breadcrumbs).toHaveLength(0);
  });
});
