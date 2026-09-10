import { expect, vi } from "vitest";
import { Kernel } from "../../packages/svelte/utils/runtime/src/kernel.ts";
import { RUNTIME_NAMESPACE, type RuntimeEvent, type RuntimeId } from "../../packages/svelte/utils/runtime/src/types.ts";

/**
 * A stand-in for the sandboxed run-time, for tests that need the other end of the protocol.
 *
 * The real sandbox is an iframe with an opaque origin running a WebAssembly engine. What
 * a test needs from it is much smaller: somewhere for the kernel's messages to go, and a
 * way to answer them. Requires a DOM environment (`// @vitest-environment happy-dom`).
 */

/**
 * Keep frames inert.
 *
 * A real iframe would try to fetch the host document, which in a test means a request to
 * nowhere. The element is otherwise real, so the sandbox attributes stay worth asserting.
 */
export function inertFrames(): void {
  const settings = (window as unknown as { happyDOM?: { settings: { navigation: { disableChildFrameNavigation: boolean } } } }).happyDOM?.settings;
  if (settings) settings.navigation.disableChildFrameNavigation = true;

  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    const element = create(tag, options);
    if (tag !== "iframe") return element;

    let src = "";
    const contentWindow = { postMessage: (_message: unknown, _origin?: string) => {} };
    Object.defineProperty(element, "src", { get: () => src, set: (value: string) => (src = value), configurable: true });
    Object.defineProperty(element, "contentWindow", { get: () => contentWindow, configurable: true });
    return element;
  }) as typeof document.createElement);
}

export interface FakeHost {
  frame: HTMLIFrameElement;
  sent: Array<Record<string, unknown>>;
  token: string;
  reply(event: RuntimeEvent, overrides?: Record<string, unknown>): void;
  impersonate(data: unknown): void;
  ready(runtime?: RuntimeId): void;
  execution(): Promise<string>;
  restarted(): boolean;
}

/** Records what the kernel sends its frame, and answers as the sandbox would. */
export function fakeHost(container: HTMLElement): FakeHost {
  const frame = container.querySelector("iframe") as HTMLIFrameElement;
  const source = frame.contentWindow as Window;
  const sent: Array<Record<string, unknown>> = [];
  vi.spyOn(source, "postMessage").mockImplementation((message: unknown) => void sent.push(message as Record<string, unknown>));

  const token = new URL(frame.src, "https://reader.test").searchParams.get("token") ?? "";

  const host: FakeHost = {
    frame,
    sent,
    token,
    reply(event, overrides = {}) {
      window.dispatchEvent(new MessageEvent("message", { data: { ns: RUNTIME_NAMESPACE, token, event, ...overrides }, source }));
    },
    /** Anything else on the page shouting the same words. */
    impersonate(data) {
      window.dispatchEvent(new MessageEvent("message", { data, source: window }));
    },
    ready(runtime: RuntimeId = "python") {
      host.reply({ type: "ready", runtime });
    },
    /** Wait until the kernel has actually asked for a run, and say which one. */
    async execution() {
      await vi.waitFor(() => expect(sent.some((message) => message.type === "execute")).toBe(true));
      return String([...sent].reverse().find((message) => message.type === "execute")?.id ?? "");
    },
    restarted() {
      return sent.some((message) => message.type === "restart");
    }
  };
  return host;
}

/** A started kernel and the stand-in listening to it. Call `inertFrames()` first. */
export function makeKernel(runtime: RuntimeId = "python", timeoutMs?: number): { kernel: Kernel; container: HTMLElement; host: FakeHost } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const kernel = new Kernel({ runtime, container, timeoutMs });
  void kernel.start();
  return { kernel, container, host: fakeHost(container) };
}
