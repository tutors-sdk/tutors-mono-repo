import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdentityClient } from "../../../packages/svelte/identity-sveltekit/src/client.ts";

const http = vi.fn();
const navigate = vi.fn();

describe("identity browser port", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("window", { location: { origin: "https://tutors.test", href: "https://tutors.test/", assign: navigate } });
    vi.stubGlobal("fetch", http);
    http.mockImplementation(async () => Response.json({ success: true }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["authjs", "better-auth"] as const)("%s rejects unsafe return URLs before contacting the SDK", async (adapter) => {
    const client = createIdentityClient(adapter);
    for (const url of ["https://attacker.test", "//attacker.test", "javascript:alert(1)", "data:text/html,unsafe"]) {
      await expect(async () => client.signIn(url)).rejects.toThrow("reader's origin");
      await expect(async () => client.signOut(url)).rejects.toThrow("reader's origin");
    }
    expect(http).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("asks Better Auth for GitHub and a safe refusal page", async () => {
    await createIdentityClient("better-auth").signIn("/course/example");
    expect(String(http.mock.calls[0][0])).toBe("https://tutors.test/api/auth/sign-in/social");
    expect(JSON.parse(http.mock.calls[0][1].body)).toMatchObject({ provider: "github", callbackURL: "https://tutors.test/course/example", errorCallbackURL: "/auth?error=denied" });
  });

  it("navigates after Better Auth confirms logout", async () => {
    await createIdentityClient("better-auth").signOut("/");
    expect(navigate).toHaveBeenCalledWith("https://tutors.test/");
  });

  it("leaves navigation to Auth.js", async () => {
    http.mockImplementation(async () => Response.json({ url: "https://tutors.test/course/example" }));
    const client = createIdentityClient("authjs");
    await client.signIn("/course/example");
    expect(http.mock.calls[0][0]).toBe("/auth/signin/github?");
    expect(new URLSearchParams(http.mock.calls[0][1].body).get("callbackUrl")).toBe("https://tutors.test/course/example");
    await client.signOut("/");
    expect(http.mock.calls[1][0]).toBe("/auth/signout");
    expect(window.location.href).toBe("https://tutors.test/course/example");
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(["signIn", "signOut"] as const)("propagates a Better Auth %s failure without navigating", async (operation) => {
    http.mockImplementation(async () => Response.json({ message: "Denied" }, { status: 403 }));
    await expect(createIdentityClient("better-auth")[operation]("/")).rejects.toThrow("Denied");
    expect(navigate).not.toHaveBeenCalled();
  });
});
