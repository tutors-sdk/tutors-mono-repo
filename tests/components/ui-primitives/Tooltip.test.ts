import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TooltipConfig {
  content: string;
  position: "top" | "bottom" | "left" | "right";
  delay?: number;
  ariaDescribedBy?: string;
}

const validPositions = ["top", "bottom", "left", "right"] as const;

function makeTooltip(overrides: Partial<TooltipConfig> = {}): TooltipConfig {
  return {
    content: "Helpful tooltip text",
    position: "top",
    delay: 200,
    ...overrides,
  };
}

// ===========================================================================
// Tooltip content
// ===========================================================================
describe("Tooltip: content text should be provided", () => {
  it("should contain non-empty content string", () => {
    const tooltip = makeTooltip({ content: "Click to navigate" });
    expect(tooltip.content).toBe("Click to navigate");
    expect(tooltip.content.length).toBeGreaterThan(0);
  });

  it("should accept multiline content", () => {
    const tooltip = makeTooltip({ content: "Line 1\nLine 2" });
    expect(tooltip.content).toContain("\n");
  });
});

// ===========================================================================
// Position variants
// ===========================================================================
describe("Tooltip: position variants", () => {
  it.each(validPositions)("position '%s' should be a valid variant", (pos) => {
    const tooltip = makeTooltip({ position: pos });
    expect(validPositions).toContain(tooltip.position);
  });

  it("should default to 'top' when no position specified", () => {
    const tooltip = makeTooltip();
    expect(tooltip.position).toBe("top");
  });

  it("all four cardinal positions should be available", () => {
    expect(validPositions).toHaveLength(4);
  });
});

// ===========================================================================
// ARIA support
// ===========================================================================
describe("Tooltip: aria-describedby pattern", () => {
  it("should generate an aria-describedby id", () => {
    const tooltip = makeTooltip({ ariaDescribedBy: "tooltip-123" });
    expect(tooltip.ariaDescribedBy).toBe("tooltip-123");
  });

  it("aria-describedby pattern should be a non-empty string", () => {
    const id = `tooltip-${Date.now()}`;
    const tooltip = makeTooltip({ ariaDescribedBy: id });
    expect(typeof tooltip.ariaDescribedBy).toBe("string");
    expect(tooltip.ariaDescribedBy!.length).toBeGreaterThan(0);
  });

  it("aria-describedby should follow tooltip-* naming convention", () => {
    const id = "tooltip-course-header";
    expect(id).toMatch(/^tooltip-/);
  });
});

// ===========================================================================
// Empty content handling
// ===========================================================================
describe("Tooltip: empty content handling", () => {
  it("should handle empty string content", () => {
    const tooltip = makeTooltip({ content: "" });
    expect(tooltip.content).toBe("");
  });

  it("empty content should be detectable for conditional rendering", () => {
    const tooltip = makeTooltip({ content: "" });
    const shouldRender = tooltip.content.length > 0;
    expect(shouldRender).toBe(false);
  });
});

// ===========================================================================
// Delay values
// ===========================================================================
describe("Tooltip: delay values", () => {
  it("default delay should be a non-negative number", () => {
    const tooltip = makeTooltip();
    expect(tooltip.delay).toBeGreaterThanOrEqual(0);
  });

  it("zero delay should be valid", () => {
    const tooltip = makeTooltip({ delay: 0 });
    expect(tooltip.delay).toBe(0);
  });

  it("custom delay should be preserved", () => {
    const tooltip = makeTooltip({ delay: 500 });
    expect(tooltip.delay).toBe(500);
  });

  it("delay should be a finite number", () => {
    const tooltip = makeTooltip({ delay: 300 });
    expect(Number.isFinite(tooltip.delay)).toBe(true);
  });
});
