/**
 * No network in the unit tier (runway tier B).
 *
 * Loaded as a Vitest setup file, so it applies to every test file. Outbound
 * connections through fetch, http(s).request/get, net.connect and tls.connect
 * throw a NetworkAccessError unless the host is loopback, the test file is
 * allow-listed below with a reason, or the test file calls `allowNetwork()`.
 *
 * A unit test that reaches the network is slow, flaky and dependent on a
 * service CI does not control. Stub the client instead; use `allowNetwork`
 * only for a test whose point is the network (and consider moving it to the
 * contract or E2E tier).
 *
 * NO_NETWORK_MODE=report logs attempts to stderr instead of throwing, to find
 * offenders without breaking a run.
 */
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import { afterAll, expect } from "vitest";

/** Test files allowed to reach the network, by path suffix, each with a reason. Shrink, don't grow. */
export const NETWORK_ALLOWED_FILES: Readonly<Record<string, string>> = {};

export class NetworkAccessError extends Error {
  constructor(host: string, via: string, file: string | undefined) {
    super(
      `Blocked ${via} to ${host} from ${file ?? "an unknown test"}: unit tests must not use the network. ` +
        `Stub the client, or call allowNetwork("reason") in a test that truly needs it (tests/support/no-network.ts).`
    );
    this.name = "NetworkAccessError";
  }
}

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\]|0\.0\.0\.0)$/i;

let allowedReason: string | undefined;

/** Opt the current test file into network access. Resets after the file. */
export function allowNetwork(reason: string): void {
  if (!reason.trim()) throw new Error("allowNetwork needs a reason");
  allowedReason = reason;
  afterAll(() => {
    allowedReason = undefined;
  });
}

function currentTestFile(): string | undefined {
  try {
    return expect.getState().testPath?.replace(/\\/g, "/");
  } catch {
    return undefined;
  }
}

/** Whether a connection to `host` from `file` is allowed. Exported for the guard's own tests. */
export function isNetworkPermitted(host: string | undefined, file: string | undefined = currentTestFile()): boolean {
  if (!host || LOOPBACK.test(host)) return true;
  if (allowedReason) return true;
  return !!file && Object.keys(NETWORK_ALLOWED_FILES).some((suffix) => file.endsWith(suffix));
}

function check(host: string | undefined, via: string): void {
  if (isNetworkPermitted(host)) return;
  const file = currentTestFile();
  if (process.env.NO_NETWORK_MODE === "report") {
    process.stderr.write(`[no-network] ${file} -> ${host} via ${via}\n`);
    return;
  }
  throw new NetworkAccessError(host ?? "?", via, file);
}

function hostOf(target: unknown): string | undefined {
  if (typeof target === "string") {
    try {
      return new URL(target).hostname;
    } catch {
      return undefined;
    }
  }
  if (target instanceof URL) return target.hostname;
  if (target && typeof target === "object") {
    if ("url" in target && typeof (target as Request).url === "string") return hostOf((target as Request).url);
    const options = target as { hostname?: string; host?: string };
    return options.hostname ?? options.host?.replace(/:\d+$/, "") ?? "localhost";
  }
  return undefined;
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function" && !(originalFetch as { __noNetwork?: boolean }).__noNetwork) {
  const guarded = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    check(hostOf(input), "fetch");
    return originalFetch(input, init);
  };
  (guarded as { __noNetwork?: boolean }).__noNetwork = true;
  globalThis.fetch = guarded as typeof fetch;
}

type RequestFn = (...args: unknown[]) => unknown;

function guardModule(module: object, name: string, via: string, hostFromArgs: (args: unknown[]) => string | undefined) {
  const record = module as Record<string, RequestFn & { __noNetwork?: boolean }>;
  const original = record[name];
  if (typeof original !== "function" || original.__noNetwork) return;
  const guarded = function (this: unknown, ...args: unknown[]) {
    check(hostFromArgs(args), via);
    return original.apply(this, args);
  } as RequestFn & { __noNetwork?: boolean };
  guarded.__noNetwork = true;
  record[name] = guarded;
}

const requestHost = (args: unknown[]) => hostOf(args[0]);
const connectHost = (args: unknown[]) =>
  typeof args[0] === "number" ? (typeof args[1] === "string" ? args[1] : "localhost") : typeof args[0] === "string" ? undefined : hostOf(args[0]);

guardModule(http, "request", "http.request", requestHost);
guardModule(http, "get", "http.get", requestHost);
guardModule(https, "request", "https.request", requestHost);
guardModule(https, "get", "https.get", requestHost);
guardModule(net, "connect", "net.connect", connectHost);
guardModule(net, "createConnection", "net.createConnection", connectHost);
guardModule(tls, "connect", "tls.connect", connectHost);
// Named ESM imports of node:http etc. are snapshots; refresh them so `import { request } from "node:https"` is guarded too.
syncBuiltinESMExports();
