// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NavigationEvent } from "@sveltejs/kit";

vi.mock("@tutors/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  addTransport: vi.fn(),
  removeTransport: vi.fn()
}));

vi.mock("@tutors/community/utils/error-transport", () => ({
  createSupabaseErrorTransport: vi.fn((appName: string) => {
    const transport = () => {};
    Object.assign(transport, { appName });
    return transport;
  })
}));

import log, { addTransport } from "@tutors/logger";
import { createSupabaseErrorTransport } from "@tutors/community/utils/error-transport";
import { initClientErrorHandling, createClientErrorHandler } from "@tutors/hooks/client";

function rejection(reason: unknown): Event {
  const event = new Event("unhandledrejection");
  Object.assign(event, { reason });
  return event;
}

describe("shared client hooks: initClientErrorHandling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers a Supabase error transport for the given app", () => {
    initClientErrorHandling("tutors-test");
    expect(createSupabaseErrorTransport).toHaveBeenCalledWith("tutors-test");
    const transport = vi.mocked(createSupabaseErrorTransport).mock.results[0].value;
    expect(addTransport).toHaveBeenCalledWith(transport);
  });

  it("logs unhandled rejections carrying an Error with message and stack", () => {
    initClientErrorHandling("tutors-test");
    const err = new Error("async boom");
    window.dispatchEvent(rejection(err));
    expect(log.error).toHaveBeenCalledWith("Unhandled promise rejection", {
      reason: "async boom",
      stack: err.stack
    });
  });

  it("stringifies non-Error rejection reasons", () => {
    initClientErrorHandling("tutors-test");
    window.dispatchEvent(rejection({ code: 42 }));
    expect(log.error).toHaveBeenCalledWith("Unhandled promise rejection", {
      reason: "[object Object]",
      stack: undefined
    });
  });
});

describe("shared client hooks: createClientErrorHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  const event = {} as NavigationEvent;

  it("returns a generic message and never leaks the error text", () => {
    const result = createClientErrorHandler()({ error: new Error("secret"), event, status: 500, message: "x" });
    expect(result).toEqual({ message: "An unexpected error occurred" });
  });

  it("logs Error instances directly and wraps everything else", () => {
    const err = new Error("boom");
    const handleError = createClientErrorHandler();
    handleError({ error: err, event, status: 500, message: "x" });
    expect(log.error).toHaveBeenCalledWith("Client error:", err);
    handleError({ error: 7, event, status: 500, message: "x" });
    expect(log.error).toHaveBeenCalledWith("Client error:", { details: 7 });
  });
});
