// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Handle, HandleClientError, HandleServerError, NavigationEvent, RequestEvent } from "@sveltejs/kit";

vi.mock("@tutors/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  addTransport: vi.fn(),
  removeTransport: vi.fn()
}));

vi.mock("@tutors/community/utils/error-transport", () => ({
  createSupabaseErrorTransport: vi.fn((appName: string) => Object.assign(() => {}, { appName }))
}));

import log, { addTransport } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";
import { securityHeaders, SECURITY_HEADERS, createServerErrorHandler } from "@tutors/hooks/server";
import { initClientErrorHandling, createClientErrorHandler } from "@tutors/hooks/client";

import * as catalogueServer from "../../../apps/catalogue/src/legacy-hooks.server";
import * as liveServer from "../../../apps/live/src/legacy-hooks.server";
import * as readerServer from "../../../apps/reader/src/legacy-hooks.server";
import * as timeServer from "../../../apps/time/src/legacy-hooks.server";
import * as catalogueClient from "../../../apps/catalogue/src/legacy-hooks.client";
import * as liveClient from "../../../apps/live/src/legacy-hooks.client";
import * as readerClient from "../../../apps/reader/src/legacy-hooks.client";
import * as timeClient from "../../../apps/time/src/legacy-hooks.client";

/**
 * PUBLIC_TUTORS_HOOKS_MODE=legacy must reproduce what each app did before
 * @tutors/hooks existed, and PUBLIC_TUTORS_HOOKS_MODE=shared must be
 * observably the same. These tests run both implementations side by side so
 * the legacy modules can be deleted with confidence once the flag is retired.
 */

const SECURITY_HEADER_NAMES = Object.keys(SECURITY_HEADERS);

function fakeEvent(): RequestEvent {
  return { request: new Request("https://tutors.dev/") } as unknown as RequestEvent;
}

async function headersFrom(handle: Handle): Promise<Record<string, string | null>> {
  const response = await handle({ event: fakeEvent(), resolve: async () => new Response("ok") });
  return Object.fromEntries(SECURITY_HEADER_NAMES.map((name) => [name, response.headers.get(name)]));
}

function serverErrorOutputs(handleError: HandleServerError) {
  vi.mocked(log.error).mockClear();
  const err = new Error("boom");
  const outputs = [
    handleError({ error: err, event: fakeEvent(), status: 500, message: "x" }),
    handleError({ error: "plain", event: fakeEvent(), status: 500, message: "x" })
  ];
  return { outputs, logCalls: vi.mocked(log.error).mock.calls };
}

function clientErrorOutputs(handleError: HandleClientError) {
  vi.mocked(log.error).mockClear();
  const event = {} as NavigationEvent;
  const err = new Error("boom");
  const outputs = [
    handleError({ error: err, event, status: 500, message: "x" }),
    handleError({ error: "plain", event, status: 500, message: "x" })
  ];
  return { outputs, logCalls: vi.mocked(log.error).mock.calls };
}

describe("legacy parity: server hooks with a handle that sets security headers", () => {
  const apps: Array<[string, Handle]> = [
    ["catalogue", catalogueServer.handle],
    ["live", liveServer.handle],
    ["reader", readerServer.securityHeaders]
  ];

  it.each(apps)("%s legacy handle sets the same headers as the shared securityHeaders", async (_app, legacyHandle) => {
    expect(await headersFrom(legacyHandle)).toEqual(await headersFrom(securityHeaders));
    expect(await headersFrom(legacyHandle)).toEqual(SECURITY_HEADERS);
  });
});

describe("legacy parity: time app never had security headers", () => {
  it("legacy handle is a passthrough that sets none of the shared headers", async () => {
    const legacy = await headersFrom(timeServer.handle);
    for (const name of SECURITY_HEADER_NAMES) expect(legacy[name]).toBeNull();
  });

  it("shared mode is the one deliberate behaviour change: time gains the headers", async () => {
    expect(await headersFrom(securityHeaders)).toEqual(SECURITY_HEADERS);
  });
});

describe("legacy parity: server error handlers", () => {
  const apps: Array<[string, HandleServerError]> = [
    ["catalogue", catalogueServer.handleError],
    ["live", liveServer.handleError],
    ["reader", readerServer.handleError],
    ["time", timeServer.handleError]
  ];

  it.each(apps)("%s legacy handleError returns and logs exactly what the shared handler does", (_app, legacyHandleError) => {
    const legacy = serverErrorOutputs(legacyHandleError);
    const shared = serverErrorOutputs(createServerErrorHandler());
    expect(legacy.outputs).toEqual(shared.outputs);
    expect(legacy.logCalls).toEqual(shared.logCalls);
  });
});

describe("legacy parity: importing a legacy client module has no side effects", () => {
  // Runs before any test clears the mocks. The legacy modules were imported at
  // the top of this file; nothing may be wired by that import alone, otherwise
  // shared mode would register the transport and listener twice.
  it("registers nothing until init() is called", () => {
    expect(addTransport).not.toHaveBeenCalled();
    expect(createSupabaseErrorTransport).not.toHaveBeenCalled();
  });
});

describe("legacy parity: client error handling", () => {
  const apps: Array<[string, { init: () => void; handleError: HandleClientError }]> = [
    ["catalogue", catalogueClient],
    ["live", liveClient],
    ["reader", readerClient],
    ["time", timeClient]
  ];

  beforeEach(() => vi.clearAllMocks());

  it.each(apps)("%s legacy init wires the same transport and rejection listener as the shared init", (app, legacy) => {
    const listen = vi.spyOn(window, "addEventListener");

    legacy.init();
    const legacyTransportApp = vi.mocked(createSupabaseErrorTransport).mock.calls[0][0];
    const legacyListeners = listen.mock.calls.filter(([type]) => type === "unhandledrejection").length;
    expect(addTransport).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    initClientErrorHandling(`tutors-${app}`);
    const sharedTransportApp = vi.mocked(createSupabaseErrorTransport).mock.calls[0][0];
    const sharedListeners = listen.mock.calls.filter(([type]) => type === "unhandledrejection").length;
    expect(addTransport).toHaveBeenCalledTimes(1);

    expect(legacyTransportApp).toBe(`tutors-${app}`);
    expect(sharedTransportApp).toBe(legacyTransportApp);
    expect(legacyListeners).toBe(1);
    expect(sharedListeners).toBe(1);
    listen.mockRestore();
  });

  it.each(apps)("%s legacy handleError returns and logs exactly what the shared handler does", (_app, legacy) => {
    const legacyResult = clientErrorOutputs(legacy.handleError);
    const sharedResult = clientErrorOutputs(createClientErrorHandler());
    expect(legacyResult.outputs).toEqual(sharedResult.outputs);
    expect(legacyResult.logCalls).toEqual(sharedResult.logCalls);
  });
});
