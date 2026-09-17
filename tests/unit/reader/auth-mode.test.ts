import { describe, expect, it } from "vitest";
import { authMode } from "../../../apps/reader/src/lib/server/auth-mode.ts";

describe("reader auth mode", () => {
  it("runs Auth.js when a secret is configured and anonymous mode is off", () => {
    expect(authMode({ PRIVATE_AUTH_SECRET: "a-secret-of-at-least-thirty-two-chars" })).toBe("enabled");
    expect(authMode({ PUBLIC_ANON_MODE: "", PRIVATE_AUTH_SECRET: "a-secret-of-at-least-thirty-two-chars" })).toBe("enabled");
  });

  it("is anonymous when PUBLIC_ANON_MODE is TRUE, with or without a secret", () => {
    expect(authMode({ PUBLIC_ANON_MODE: "TRUE" })).toBe("anonymous");
    expect(authMode({ PUBLIC_ANON_MODE: "true", PRIVATE_AUTH_SECRET: "set" })).toBe("anonymous");
  });

  it("is unconfigured when no secret is set outside anonymous mode, instead of letting Auth.js throw on every page", () => {
    expect(authMode({})).toBe("unconfigured");
    expect(authMode({ PUBLIC_ANON_MODE: "FALSE", PRIVATE_AUTH_SECRET: "   " })).toBe("unconfigured");
  });
});
