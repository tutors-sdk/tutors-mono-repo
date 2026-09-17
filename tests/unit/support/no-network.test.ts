import http from "node:http";
import https, { request as namedHttpsRequest } from "node:https";
import net from "node:net";
import { describe, expect, it } from "vitest";
import { NETWORK_ALLOWED_FILES, NetworkAccessError, isNetworkPermitted } from "../../support/no-network.ts";

// Negative fixtures for the no-network guard (tests/support/no-network.ts), which the
// root and fuzz Vitest configs load as a setup file. Nothing here reaches the network:
// every blocked call throws before a socket opens.
describe("no network in the unit tier (runway tier B)", () => {
  it("blocks fetch to a remote host", async () => {
    await expect(fetch("https://example.com/tutors.json")).rejects.toBeInstanceOf(NetworkAccessError);
    await expect(fetch(new URL("https://api.github.com/"))).rejects.toThrow(/unit tests must not use the network/);
    await expect(fetch(new Request("https://supabase.example.co/rest/v1/"))).rejects.toThrow(/supabase\.example\.co/);
  });

  it("blocks http and https requests, including named ESM imports", () => {
    expect(() => http.get("http://example.com/")).toThrow(NetworkAccessError);
    expect(() => https.request({ hostname: "example.com", path: "/" })).toThrow(NetworkAccessError);
    expect(() => namedHttpsRequest("https://example.com/")).toThrow(NetworkAccessError);
  });

  it("blocks raw sockets", () => {
    expect(() => net.connect({ host: "example.com", port: 443 })).toThrow(NetworkAccessError);
    expect(() => net.createConnection(443, "example.com")).toThrow(NetworkAccessError);
  });

  it("names the offending test file in the error", async () => {
    await expect(fetch("https://example.com/")).rejects.toThrow(/no-network\.test\.ts/);
  });

  it("allows loopback, so tests can talk to a local fixture server", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "[::1]"]) expect(isNetworkPermitted(host, "tests/unit/x.test.ts")).toBe(true);
    expect(isNetworkPermitted("example.com", "tests/unit/x.test.ts")).toBe(false);
  });

  it("every allow-listed file has a reason", () => {
    for (const [file, reason] of Object.entries(NETWORK_ALLOWED_FILES)) {
      expect(reason.trim().length, `${file} needs a reason`).toBeGreaterThan(10);
    }
  });
});
