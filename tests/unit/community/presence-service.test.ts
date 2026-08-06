import { describe, it, expect, vi } from "vitest";
import { MockPartySocket } from "../../bdd/support/mocks";

/**
 * Presence service tests via MockPartySocket.
 *
 * The community package uses PartySocket for real-time presence. These tests
 * validate the mock's event delivery, removal, and lifecycle behaviour.
 */

describe("presence-service: simulateMessage delivers to handlers", () => {
  it("delivers a message to a registered handler", () => {
    const socket = new MockPartySocket();
    const received: string[] = [];

    socket.addEventListener("message", (event: MessageEvent) => {
      received.push(event.data);
    });

    socket.simulateMessage({ user: "alice", action: "join" });
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0])).toEqual({ user: "alice", action: "join" });
  });

  it("delivers to multiple registered handlers", () => {
    const socket = new MockPartySocket();
    const callCount = { a: 0, b: 0 };

    socket.addEventListener("message", () => { callCount.a++; });
    socket.addEventListener("message", () => { callCount.b++; });

    socket.simulateMessage({ ping: true });
    expect(callCount.a).toBe(1);
    expect(callCount.b).toBe(1);
  });
});

describe("presence-service: simulateClose", () => {
  it("sets readyState to CLOSED", () => {
    const socket = new MockPartySocket();
    expect(socket.readyState).toBe(WebSocket.OPEN);

    socket.simulateClose();
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  });

  it("fires close handlers", () => {
    const socket = new MockPartySocket();
    const closeHandler = vi.fn();

    socket.addEventListener("close", closeHandler);
    socket.simulateClose();
    expect(closeHandler).toHaveBeenCalledTimes(1);
  });
});

describe("presence-service: removeEventListener", () => {
  it("stops delivery after removing a message handler", () => {
    const socket = new MockPartySocket();
    const handler = vi.fn();

    socket.addEventListener("message", handler);
    socket.simulateMessage({ data: "first" });
    expect(handler).toHaveBeenCalledTimes(1);

    socket.removeEventListener("message", handler);
    socket.simulateMessage({ data: "second" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("stops delivery after removing a close handler", () => {
    const socket = new MockPartySocket();
    const handler = vi.fn();

    socket.addEventListener("close", handler);
    socket.removeEventListener("close", handler);
    socket.simulateClose();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("presence-service: send and close", () => {
  it("send() accepts string data without error", () => {
    const socket = new MockPartySocket();
    expect(() => socket.send("hello")).not.toThrow();
  });

  it("send() accepts ArrayBuffer data without error", () => {
    const socket = new MockPartySocket();
    const buffer = new ArrayBuffer(8);
    expect(() => socket.send(buffer)).not.toThrow();
  });

  it("close() triggers close handlers and sets CLOSED state", () => {
    const socket = new MockPartySocket();
    const closeHandler = vi.fn();
    socket.addEventListener("close", closeHandler);

    socket.close();
    expect(socket.readyState).toBe(WebSocket.CLOSED);
    expect(closeHandler).toHaveBeenCalledTimes(1);
  });
});
