import { describe, it, expect } from "vitest";
import { resolveHooksMode, usesSharedHooks, DEFAULT_HOOKS_MODE, HOOKS_MODE_ENV } from "@tutors/hooks/mode";

/**
 * PUBLIC_TUTORS_HOOKS_MODE selects between each app's original inline hooks
 * ("legacy") and the shared @tutors/hooks package ("shared"). The resolver is
 * the only thing standing between a mistyped env var and an app with no hooks,
 * so its fallback behaviour is pinned here.
 */

describe("hooks mode: resolveHooksMode", () => {
  it("selects shared when the env var says so", () => {
    expect(resolveHooksMode("shared")).toBe("shared");
  });

  it("selects legacy when the env var says so", () => {
    expect(resolveHooksMode("legacy")).toBe("legacy");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(resolveHooksMode("  SHARED ")).toBe("shared");
    expect(resolveHooksMode("Legacy\n")).toBe("legacy");
  });

  it.each([undefined, null, "", "   "])("falls back to the default when the value is %j", (raw) => {
    expect(resolveHooksMode(raw)).toBe(DEFAULT_HOOKS_MODE);
  });

  it.each(["true", "1", "on", "sharedd", "new", "old"])("falls back to the default for unrecognised value %j", (raw) => {
    expect(resolveHooksMode(raw)).toBe(DEFAULT_HOOKS_MODE);
  });
});

describe("hooks mode: usesSharedHooks", () => {
  it("is true only for the shared mode", () => {
    expect(usesSharedHooks("shared")).toBe(true);
    expect(usesSharedHooks("legacy")).toBe(false);
    expect(usesSharedHooks(undefined)).toBe(DEFAULT_HOOKS_MODE === "shared");
  });
});

describe("hooks mode: rollout contract", () => {
  it("defaults to legacy so deployments that predate the flag keep their behaviour", () => {
    // Flipping this default is step 1 of retiring the legacy hooks
    // (packages/svelte/utils/hooks/README.md). Update this test when you do.
    expect(DEFAULT_HOOKS_MODE).toBe("legacy");
  });

  it("uses a PUBLIC_ variable so hooks.client.ts can read the same flag as hooks.server.ts", () => {
    expect(HOOKS_MODE_ENV).toBe("PUBLIC_TUTORS_HOOKS_MODE");
    expect(HOOKS_MODE_ENV.startsWith("PUBLIC_")).toBe(true);
  });
});
