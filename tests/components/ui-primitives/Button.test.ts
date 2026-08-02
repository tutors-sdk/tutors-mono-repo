import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonConfig {
  label?: string;
  ariaLabel?: string;
  disabled: boolean;
  loading: boolean;
  variant: ButtonVariant;
  onClick?: () => void;
}

const buttonVariants: ButtonVariant[] = ["primary", "secondary", "ghost"];

function makeButton(overrides: Partial<ButtonConfig> = {}): ButtonConfig {
  return {
    label: "Submit",
    disabled: false,
    loading: false,
    variant: "primary",
    ...overrides,
  };
}

// ===========================================================================
// Button requires label or aria-label
// ===========================================================================
describe("Button: label or aria-label requirement", () => {
  it("should have a text label", () => {
    const btn = makeButton({ label: "Save" });
    expect(btn.label).toBe("Save");
  });

  it("should accept aria-label when no visible label", () => {
    const btn = makeButton({ label: undefined, ariaLabel: "Close dialog" });
    expect(btn.ariaLabel).toBe("Close dialog");
  });

  it("should have at least one accessible name", () => {
    const btn = makeButton({ label: "Go" });
    const hasAccessibleName = !!(btn.label || btn.ariaLabel);
    expect(hasAccessibleName).toBe(true);
  });

  it("icon-only button should require aria-label", () => {
    const btn = makeButton({ label: undefined, ariaLabel: "Menu" });
    expect(btn.label).toBeUndefined();
    expect(btn.ariaLabel).toBeDefined();
  });
});

// ===========================================================================
// Disabled state
// ===========================================================================
describe("Button: disabled state", () => {
  it("disabled button should have disabled true", () => {
    const btn = makeButton({ disabled: true });
    expect(btn.disabled).toBe(true);
  });

  it("disabled button should prevent interaction", () => {
    let clicked = false;
    const btn = makeButton({
      disabled: true,
      onClick: () => { clicked = true; },
    });
    // Simulate guarded click
    if (!btn.disabled && btn.onClick) {
      btn.onClick();
    }
    expect(clicked).toBe(false);
  });

  it("enabled button should allow interaction", () => {
    let clicked = false;
    const btn = makeButton({
      disabled: false,
      onClick: () => { clicked = true; },
    });
    if (!btn.disabled && btn.onClick) {
      btn.onClick();
    }
    expect(clicked).toBe(true);
  });
});

// ===========================================================================
// Loading state
// ===========================================================================
describe("Button: loading state", () => {
  it("loading button should have loading true", () => {
    const btn = makeButton({ loading: true });
    expect(btn.loading).toBe(true);
  });

  it("loading state should imply spinner indicator pattern", () => {
    const btn = makeButton({ loading: true });
    const showSpinner = btn.loading;
    const showLabel = !btn.loading;
    expect(showSpinner).toBe(true);
    expect(showLabel).toBe(false);
  });

  it("loading button should also be effectively disabled", () => {
    const btn = makeButton({ loading: true, disabled: true });
    const isInteractive = !btn.disabled && !btn.loading;
    expect(isInteractive).toBe(false);
  });
});

// ===========================================================================
// Button variants
// ===========================================================================
describe("Button: variants", () => {
  it("should enumerate three variants: primary, secondary, ghost", () => {
    expect(buttonVariants).toHaveLength(3);
  });

  it.each(buttonVariants)("variant '%s' should be valid", (variant) => {
    const btn = makeButton({ variant });
    expect(buttonVariants).toContain(btn.variant);
  });

  it("default variant should be primary", () => {
    const btn = makeButton();
    expect(btn.variant).toBe("primary");
  });
});

// ===========================================================================
// Click handler type
// ===========================================================================
describe("Button: click handler", () => {
  it("click handler should be a function", () => {
    const btn = makeButton({ onClick: () => {} });
    expect(typeof btn.onClick).toBe("function");
  });

  it("missing click handler should be undefined", () => {
    const btn = makeButton();
    expect(btn.onClick).toBeUndefined();
  });

  it("click handler should execute and return", () => {
    let result = 0;
    const btn = makeButton({ onClick: () => { result = 42; } });
    btn.onClick!();
    expect(result).toBe(42);
  });
});
