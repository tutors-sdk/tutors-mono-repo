import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../packages/svelte/community/src/utils/supabase-client.ts",
  () => ({
    supabase: { from: () => ({ insert: vi.fn() }) },
  }),
);

vi.mock("$env/dynamic/public", () => ({
  env: {
    PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  },
}));

import { createSupabaseErrorTransport } from "../../../packages/svelte/community/src/utils/error-transport.ts";

// The flush on page unload: tutors.dev answered it with 400 because the URL carried `Prefer=return=none`,
// which PostgREST parses as a filter (release harness rollback report, tutors-release-harness#38).
describe("error transport: flush on unload", () => {
  afterEach(() => vi.unstubAllGlobals());

  function unloadWith(
    navigator: Record<string, unknown>,
    fetch = vi.fn(() => Promise.resolve(new Response())),
  ) {
    let onUnload: (() => void) | undefined;
    vi.stubGlobal("window", {
      location: { href: "https://tutors.dev/note/course/x" },
      addEventListener: (type: string, fn: () => void) => {
        if (type === "beforeunload") onUnload = fn;
      },
    });
    vi.stubGlobal("navigator", { userAgent: "test", ...navigator });
    vi.stubGlobal("fetch", fetch);
    const send = createSupabaseErrorTransport("reader");
    send({
      timestamp: "t",
      level: "error",
      message: "boom",
      app: "reader",
    } as never);
    onUnload!();
    return fetch;
  }

  it("beacons to the table with only the key in the query string", () => {
    const sendBeacon = vi.fn(() => true);
    unloadWith({ sendBeacon });
    expect(sendBeacon).toHaveBeenCalledOnce();
    const [url] = sendBeacon.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      "https://project.supabase.co/rest/v1/app_errors?apikey=anon-key",
    );
    expect(new URL(url).searchParams.has("Prefer")).toBe(false);
  });

  it("falls back to a keepalive fetch that asks for no body in the header PostgREST reads", () => {
    const fetch = unloadWith({});
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      NonNullable<Parameters<typeof fetch>[1]> & {
        headers: Record<string, string>;
      },
    ];
    expect(new URL(url).searchParams.has("Prefer")).toBe(false);
    expect(init.headers.Prefer).toBe("return=minimal");
    expect(init.keepalive).toBe(true);
  });
});
