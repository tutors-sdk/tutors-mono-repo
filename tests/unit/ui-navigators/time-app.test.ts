import { describe, it, expect, afterEach, vi } from "vitest";
import { timeAppUrl } from "../../../packages/svelte/ui-navigators/src/utils/time-app";

/**
 * Links out to the TutorsTime deployment.
 *
 * The failure mode this guards is quiet: a wrong origin still renders a
 * perfectly good-looking link, and only sends the educator to production (or
 * to nothing) when they click it. The localhost branch is the whole reason
 * this helper exists, so it is the case worth pinning.
 */

function stubHostname(hostname: string) {
  vi.stubGlobal("location", { hostname });
}

describe("timeAppUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("points at the production deployment from a published course", () => {
    stubHostname("cs101-2025.netlify.app");
    expect(timeAppUrl("cs101-2025")).toBe("https://time.tutors.dev/cs101-2025");
  });

  it("points at the dev server when the reader is on localhost", () => {
    stubHostname("localhost");
    expect(timeAppUrl("localhost:54321")).toBe("http://localhost:5176/localhost:54321");
  });

  it("treats 127.0.0.1 as local", () => {
    stubHostname("127.0.0.1");
    expect(timeAppUrl("cs101")).toBe("http://localhost:5176/cs101");
  });

  it("treats a LAN address as local", () => {
    stubHostname("192.168.0.5");
    expect(timeAppUrl("cs101")).toBe("http://localhost:5176/cs101");
  });

  it("appends a sub-route", () => {
    stubHostname("cs101.netlify.app");
    expect(timeAppUrl("cs101", "gists")).toBe("https://time.tutors.dev/cs101/gists");
  });

  it("does not double the slash on a leading one", () => {
    stubHostname("cs101.netlify.app");
    expect(timeAppUrl("cs101", "/gists")).toBe("https://time.tutors.dev/cs101/gists");
  });

  it("falls back to production when there is no location (SSR)", () => {
    vi.stubGlobal("location", undefined);
    expect(timeAppUrl("cs101")).toBe("https://time.tutors.dev/cs101");
  });

  it("survives a missing course id rather than emitting `undefined`", () => {
    stubHostname("cs101.netlify.app");
    expect(timeAppUrl(undefined, "gists")).toBe("https://time.tutors.dev//gists");
  });
});
