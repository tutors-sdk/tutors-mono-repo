/**
 * The page's handle on a sandboxed run-time.
 *
 * The kernel lives in an iframe carrying `sandbox="allow-scripts"` and nothing else. That
 * frame has an opaque origin, which is the point: student code — and course-author code,
 * which arrives from a third-party repository and runs in every student's browser — can
 * reach neither the reader's storage nor its Supabase session. Inside the frame the code
 * runs in a worker, so a runaway loop is stopped by discarding the worker rather than by
 * freezing the tab.
 *
 * One kernel is one long-lived execution context. A notebook keeps one for the page so
 * cells share a namespace; a playground keeps one and runs whole programs through it.
 */

import { RUNTIME_NAMESPACE, type ExecuteRequest, type ExecutionResult, type RuntimeEvent, type RuntimeId } from "./types.ts";

/** Location of the sandbox document, served by the reader. */
const HOST_PAGE = "/runtimes/runtime-host.html";

/** A run that never finishes would hold the Run button hostage, so every run has a ceiling. */
export const DEFAULT_TIMEOUT_MS = 60_000;

export interface KernelOptions {
  runtime: RuntimeId;
  /** Where to attach the sandbox frame. Defaults to the document body, kept hidden. */
  container?: HTMLElement;
  timeoutMs?: number;
  onEvent?: (event: RuntimeEvent) => void;
}

type Pending = {
  resolve: (result: ExecutionResult) => void;
  chunks: string[];
  stderr: string[];
  value: string;
  error: string;
  timer: ReturnType<typeof setTimeout> | undefined;
};

let sequence = 0;

export class Kernel {
  readonly runtime: RuntimeId;

  private frame: HTMLIFrameElement | undefined;
  private readonly token = crypto.randomUUID();
  private readonly timeoutMs: number;
  private readonly container: HTMLElement | undefined;
  private listeners = new Set<(event: RuntimeEvent) => void>();
  private ready: Promise<void> | undefined;
  private signalReady: (() => void) | undefined;
  private pending = new Map<string, Pending>();
  private disposed = false;

  constructor(options: KernelOptions) {
    this.runtime = options.runtime;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.container = options.container;
    if (options.onEvent) this.listeners.add(options.onEvent);
  }

  /**
   * Listen to everything the kernel emits, until the returned function is called.
   *
   * More than one listener at a time is the normal case: a notebook watches the kernel's
   * status for its whole life while each cell listens for its own run's output.
   */
  subscribe(onEvent: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(onEvent);
    return () => this.listeners.delete(onEvent);
  }

  private emit(event: RuntimeEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  /**
   * Bring the sandbox up.
   *
   * Called implicitly by `execute`, and worth calling directly when a component wants the
   * engine downloading while the student is still reading the exercise.
   */
  start(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve) => {
      this.signalReady = resolve;
    });

    window.addEventListener("message", this.handleMessage);

    const frame = document.createElement("iframe");
    // No allow-same-origin: with it the frame would share the reader's origin and the
    // isolation this whole design rests on would be gone.
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("title", "Tutors code run-time");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "width:0;height:0;border:0;position:absolute;visibility:hidden;";
    frame.src = `${HOST_PAGE}?token=${encodeURIComponent(this.token)}&runtime=${encodeURIComponent(this.runtime)}`;
    (this.container ?? document.body).appendChild(frame);
    this.frame = frame;

    return this.ready;
  }

  /**
   * Run one request to completion.
   *
   * Streaming output is delivered through `onEvent` as it arrives; the returned result is
   * the same output gathered up, for callers that only care about the end state.
   */
  async execute(request: Omit<ExecuteRequest, "id"> & { id?: string }): Promise<ExecutionResult> {
    if (this.disposed) throw new Error("This kernel has been disposed");
    await this.start();

    const id = request.id ?? `exec-${++sequence}`;
    const started = performance.now();

    return new Promise<ExecutionResult>((resolve) => {
      const pending: Pending = { resolve, chunks: [], stderr: [], value: "", error: "", timer: undefined };
      pending.timer = setTimeout(() => {
        // The worker is gone rather than interrupted: nothing in a WebAssembly run-time
        // reliably answers an interrupt, and a stuck kernel is worse than a cold one.
        this.restart();
        this.settle(id, false, started, `Stopped after ${Math.round(this.timeoutMs / 1000)}s — the code was still running.`);
      }, this.timeoutMs);
      this.pending.set(id, pending);

      this.post({ ...request, id, type: "execute", token: this.token });
    });
  }

  /** Stop whatever is running now. The kernel comes back empty. */
  stop(): void {
    if (this.pending.size === 0) return;
    this.restart();
    for (const id of [...this.pending.keys()]) {
      this.settle(id, false, performance.now(), "Stopped.");
    }
  }

  /** Discard all execution state — a notebook's Restart Kernel. */
  restart(): void {
    this.post({ type: "restart", token: this.token, runtime: this.runtime });
  }

  dispose(): void {
    this.disposed = true;
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
    }
    this.pending.clear();
    this.listeners.clear();
    window.removeEventListener("message", this.handleMessage);
    this.frame?.remove();
    this.frame = undefined;
    this.ready = undefined;
  }

  private post(message: Record<string, unknown>): void {
    // A caller hands its workspace over straight from component state, and Svelte 5 state is
    // a Proxy, which structured clone refuses. Every message here is JSON-shaped, so send a
    // plain copy rather than asking each caller to remember to snapshot.
    const payload = JSON.parse(JSON.stringify({ ns: RUNTIME_NAMESPACE, ...message }));
    // The frame's origin is opaque, so "*" is the only targetOrigin that can reach it.
    // The token is what makes the channel trustworthy in both directions.
    this.frame?.contentWindow?.postMessage(payload, "*");
  }

  private handleMessage = (event: MessageEvent): void => {
    const data = event.data;
    if (!data || data.ns !== RUNTIME_NAMESPACE || data.token !== this.token) return;
    if (event.source !== this.frame?.contentWindow) return;

    const runtimeEvent = data.event as RuntimeEvent;
    if (!runtimeEvent) return;

    if (runtimeEvent.type === "ready") {
      this.signalReady?.();
    }
    if (runtimeEvent.type === "stream" || runtimeEvent.type === "result" || runtimeEvent.type === "error" || runtimeEvent.type === "done") {
      this.collect(runtimeEvent);
    }
    this.emit(runtimeEvent);
  };

  private collect(event: RuntimeEvent & { id: string }): void {
    const pending = this.pending.get(event.id);
    if (!pending) return;

    if (event.type === "stream") {
      pending.chunks.push(event.text);
      if (event.stream === "stderr") pending.stderr.push(event.text);
    }
    if (event.type === "result") pending.value = event.value;
    if (event.type === "error") {
      pending.error = event.message;
      pending.chunks.push(event.message.endsWith("\n") ? event.message : `${event.message}\n`);
      pending.stderr.push(event.message);
    }
    if (event.type === "done") {
      if (pending.timer) clearTimeout(pending.timer);
      this.pending.delete(event.id);
      pending.resolve({
        ok: event.ok,
        output: pending.chunks.join(""),
        stderr: pending.stderr.join(""),
        value: pending.value,
        error: pending.error,
        durationMs: event.durationMs
      });
    }
  }

  /** Finish a request the sandbox will never answer — a timeout or a manual stop. */
  private settle(id: string, ok: boolean, started: number, message: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.chunks.push(`${message}\n`);
    pending.stderr.push(message);
    this.emit({ type: "error", id, message });
    this.emit({ type: "done", id, ok, durationMs: performance.now() - started });
    pending.resolve({
      ok,
      output: pending.chunks.join(""),
      stderr: pending.stderr.join(""),
      value: pending.value,
      error: message,
      durationMs: performance.now() - started
    });
  }
}
