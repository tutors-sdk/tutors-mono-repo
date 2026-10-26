import { describe, it, expect, vi } from "vitest";
import {
  getSupabase,
  initSupabase,
  timedFetch,
} from "../../../packages/jsr/time/src/services/supabase";

// ===========================================================================
// getSupabase / initSupabase
// ===========================================================================
describe("getSupabase", () => {
  it("refuses to build a client before initSupabase is called", () => {
    expect(() => getSupabase()).toThrow(/Supabase not initialised/);
  });

  it("builds a client once a URL and key are configured", () => {
    initSupabase("http://localhost:54321", "anon-key");
    const client = getSupabase();
    expect(typeof client.from).toBe("function");
  });
});

describe("initSupabase", () => {
  it("keeps the client while the URL and key are unchanged, and builds a new one when either changes (Rule 0601)", () => {
    initSupabase("http://localhost:54321", "anon-key");
    const first = getSupabase();
    initSupabase("http://localhost:54321", "anon-key");
    expect(getSupabase()).toBe(first);
    initSupabase("http://localhost:54322", "anon-key");
    const otherUrl = getSupabase();
    expect(otherUrl).not.toBe(first);
    initSupabase("http://localhost:54322", "other-key");
    expect(getSupabase()).not.toBe(otherUrl);
  });
});

describe("timedFetch", () => {
  it("works where setTimeout returns a number with no unref, as in a browser", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("setTimeout", () => 1);
    try {
      await expect(timedFetch(10, fetchImpl as unknown as typeof fetch)("https://db.invalid")).resolves.toBeInstanceOf(Response);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
