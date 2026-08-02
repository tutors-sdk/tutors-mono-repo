import { describe, it, expect } from "vitest";

/**
 * Accessibility (a11y) helper tests.
 *
 * These tests validate common accessibility patterns used in the Tutors
 * reader: ARIA roles, focus attributes, skip-to-content links, and
 * screen reader announcement patterns.
 */

const VALID_ARIA_ROLES = [
  "banner", "navigation", "main", "complementary", "contentinfo",
  "search", "form", "region", "alert", "alertdialog",
  "dialog", "tablist", "tab", "tabpanel", "button",
  "link", "menubar", "menu", "menuitem", "img",
];

const FOCUS_ATTRIBUTES = ["tabindex", "autofocus", "aria-activedescendant"];

function isValidAriaRole(role: string): boolean {
  return VALID_ARIA_ROLES.includes(role);
}

function createSkipLink(targetId: string, text: string): { href: string; text: string; className: string } {
  return {
    href: `#${targetId}`,
    text,
    className: "sr-only focus:not-sr-only",
  };
}

function createAnnouncement(message: string, politeness: "polite" | "assertive" = "polite"): Record<string, string> {
  return {
    role: politeness === "assertive" ? "alert" : "status",
    "aria-live": politeness,
    "aria-atomic": "true",
    textContent: message,
  };
}

describe("a11y: ARIA role validation", () => {
  it("recognizes valid landmark roles", () => {
    expect(isValidAriaRole("banner")).toBe(true);
    expect(isValidAriaRole("navigation")).toBe(true);
    expect(isValidAriaRole("main")).toBe(true);
    expect(isValidAriaRole("complementary")).toBe(true);
  });

  it("recognizes valid widget roles", () => {
    expect(isValidAriaRole("button")).toBe(true);
    expect(isValidAriaRole("dialog")).toBe(true);
    expect(isValidAriaRole("tabpanel")).toBe(true);
  });

  it("rejects invalid role strings", () => {
    expect(isValidAriaRole("header")).toBe(false);
    expect(isValidAriaRole("footer")).toBe(false);
    expect(isValidAriaRole("sidebar")).toBe(false);
  });
});

describe("a11y: focus-related attributes", () => {
  it("tabindex is a recognized focus attribute", () => {
    expect(FOCUS_ATTRIBUTES).toContain("tabindex");
  });

  it("autofocus is a recognized focus attribute", () => {
    expect(FOCUS_ATTRIBUTES).toContain("autofocus");
  });

  it("aria-activedescendant is a recognized focus attribute", () => {
    expect(FOCUS_ATTRIBUTES).toContain("aria-activedescendant");
  });
});

describe("a11y: skip-to-content link patterns", () => {
  it("creates a skip link with correct href", () => {
    const link = createSkipLink("main-content", "Skip to main content");
    expect(link.href).toBe("#main-content");
  });

  it("creates a skip link with screen-reader-only styling", () => {
    const link = createSkipLink("main-content", "Skip to main content");
    expect(link.className).toContain("sr-only");
    expect(link.className).toContain("focus:not-sr-only");
  });

  it("preserves the link text", () => {
    const link = createSkipLink("nav", "Skip to navigation");
    expect(link.text).toBe("Skip to navigation");
  });
});

describe("a11y: screen reader announcement patterns", () => {
  it("creates a polite announcement with role='status'", () => {
    const announcement = createAnnouncement("Page loaded");
    expect(announcement.role).toBe("status");
    expect(announcement["aria-live"]).toBe("polite");
    expect(announcement["aria-atomic"]).toBe("true");
  });

  it("creates an assertive announcement with role='alert'", () => {
    const announcement = createAnnouncement("Error occurred!", "assertive");
    expect(announcement.role).toBe("alert");
    expect(announcement["aria-live"]).toBe("assertive");
  });

  it("includes the message text", () => {
    const announcement = createAnnouncement("3 results found");
    expect(announcement.textContent).toBe("3 results found");
  });
});
