import { describe, it, expect } from "vitest";
import {
  getSupabase,
  initSupabase,
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
