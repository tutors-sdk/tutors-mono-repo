import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface NavItem {
  title: string;
  route: string;
  children?: NavItem[];
}

interface SidebarState {
  collapsed: boolean;
  items: NavItem[];
  activeRoute: string;
}

function makeSidebar(overrides: Partial<SidebarState> = {}): SidebarState {
  return {
    collapsed: false,
    items: [
      { title: "Home", route: "/" },
      { title: "Topics", route: "/topics" },
      { title: "Labs", route: "/labs" },
    ],
    activeRoute: "/",
    ...overrides,
  };
}

function findActiveItem(items: NavItem[], route: string): NavItem | undefined {
  for (const item of items) {
    if (item.route === route) return item;
    if (item.children) {
      const found = findActiveItem(item.children, route);
      if (found) return found;
    }
  }
  return undefined;
}

// ===========================================================================
// Collapsed and expanded states
// ===========================================================================
describe("Sidebar: collapsed and expanded states", () => {
  it("should start in expanded state by default", () => {
    const sidebar = makeSidebar();
    expect(sidebar.collapsed).toBe(false);
  });

  it("should support collapsed state", () => {
    const sidebar = makeSidebar({ collapsed: true });
    expect(sidebar.collapsed).toBe(true);
  });

  it("collapsed state should be a boolean", () => {
    const sidebar = makeSidebar();
    expect(typeof sidebar.collapsed).toBe("boolean");
  });
});

// ===========================================================================
// Navigation items
// ===========================================================================
describe("Sidebar: navigation items", () => {
  it("each item should have a title and route", () => {
    const sidebar = makeSidebar();
    sidebar.items.forEach((item) => {
      expect(item.title).toBeDefined();
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.route).toBeDefined();
      expect(item.route.length).toBeGreaterThan(0);
    });
  });

  it("should have at least one navigation item", () => {
    const sidebar = makeSidebar();
    expect(sidebar.items.length).toBeGreaterThan(0);
  });

  it("routes should start with /", () => {
    const sidebar = makeSidebar();
    sidebar.items.forEach((item) => {
      expect(item.route).toMatch(/^\//);
    });
  });
});

// ===========================================================================
// Active item identification
// ===========================================================================
describe("Sidebar: active item by current route", () => {
  it("should identify active item matching current route", () => {
    const sidebar = makeSidebar({ activeRoute: "/topics" });
    const active = findActiveItem(sidebar.items, sidebar.activeRoute);
    expect(active).toBeDefined();
    expect(active!.title).toBe("Topics");
  });

  it("should return undefined for non-matching route", () => {
    const sidebar = makeSidebar({ activeRoute: "/nonexistent" });
    const active = findActiveItem(sidebar.items, sidebar.activeRoute);
    expect(active).toBeUndefined();
  });
});

// ===========================================================================
// Collapse toggle
// ===========================================================================
describe("Sidebar: collapse toggle", () => {
  it("toggling should switch from expanded to collapsed", () => {
    const sidebar = makeSidebar({ collapsed: false });
    sidebar.collapsed = !sidebar.collapsed;
    expect(sidebar.collapsed).toBe(true);
  });

  it("toggling should switch from collapsed to expanded", () => {
    const sidebar = makeSidebar({ collapsed: true });
    sidebar.collapsed = !sidebar.collapsed;
    expect(sidebar.collapsed).toBe(false);
  });

  it("double toggle should return to original state", () => {
    const sidebar = makeSidebar({ collapsed: false });
    sidebar.collapsed = !sidebar.collapsed;
    sidebar.collapsed = !sidebar.collapsed;
    expect(sidebar.collapsed).toBe(false);
  });
});

// ===========================================================================
// Nested children
// ===========================================================================
describe("Sidebar: nested children support", () => {
  it("navigation items should support children array", () => {
    const sidebar = makeSidebar({
      items: [
        {
          title: "Course",
          route: "/course",
          children: [
            { title: "Week 1", route: "/course/week-1" },
            { title: "Week 2", route: "/course/week-2" },
          ],
        },
      ],
    });
    expect(sidebar.items[0].children).toHaveLength(2);
    expect(sidebar.items[0].children![0].title).toBe("Week 1");
  });

  it("should find active item within nested children", () => {
    const items: NavItem[] = [
      {
        title: "Course",
        route: "/course",
        children: [{ title: "Week 1", route: "/course/week-1" }],
      },
    ];
    const active = findActiveItem(items, "/course/week-1");
    expect(active).toBeDefined();
    expect(active!.title).toBe("Week 1");
  });

  it("items without children should have undefined children", () => {
    const sidebar = makeSidebar();
    expect(sidebar.items[0].children).toBeUndefined();
  });
});
