// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RUNTIME_NAMESPACE, type RuntimeEvent } from "../../../packages/svelte/utils/runtime/src/types.ts";
import { inertFrames, makeKernel } from "../../support/runtime-kernel-harness.ts";

/**
 * The conversation between the page and its sandbox.
 *
 * The sandbox is replaced here by a stand-in that speaks the same protocol, so these tests
 * are about the half of it that ships in every reader: what the kernel sends, what it
 * accepts, what it refuses, and what a caller is promised when the sandbox goes quiet.
 */

beforeEach(() => inertFrames());

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("Kernel: the sandbox it builds", () => {
  it("runs code in a frame that cannot reach the reader's origin", () => {
    const { container } = makeKernel();
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("hides the frame from sight and from assistive technology", () => {
    const { container } = makeKernel();
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.style.visibility).toBe("hidden");
  });

  it("tells the host which runtime to load", () => {
    const { container } = makeKernel("typescript");
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.src).toContain("/runtimes/runtime-host.html");
    expect(frame.src).toContain("runtime=typescript");
  });

  it("builds one frame however often it is started", async () => {
    const { kernel, container, host } = makeKernel();
    const second = kernel.start();
    host.ready();
    await second;
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("gives each kernel on a page its own token", () => {
    const first = makeKernel();
    const second = makeKernel();
    expect(first.host.token).not.toBe("");
    expect(first.host.token).not.toBe(second.host.token);
  });
});

describe("Kernel: running code", () => {
  it("waits for the sandbox to be ready before asking it to run anything", async () => {
    const { kernel, host } = makeKernel();
    const run = kernel.execute({ runtime: "python", mode: "script", files: [{ path: "main.py", content: "print(1)" }], entry: "main.py" });

    await Promise.resolve();
    expect(host.sent.some((message) => message.type === "execute")).toBe(false);

    host.ready();
    const id = await host.execution();
    host.reply({ type: "done", id, ok: true, durationMs: 1 });
    await expect(run).resolves.toMatchObject({ ok: true });
  });

  it("sends the whole workspace, not just the entry point", async () => {
    const { kernel, host } = makeKernel();
    host.ready();
    void kernel.execute({
      runtime: "python",
      mode: "test",
      entry: "main.py",
      packages: ["numpy"],
      files: [
        { path: "main.py", content: "print(1)" },
        { path: "helper.py", content: "x = 1" }
      ]
    });
    await host.execution();

    const execute = host.sent.find((message) => message.type === "execute") as Record<string, unknown>;
    expect(execute.mode).toBe("test");
    expect(execute.packages).toEqual(["numpy"]);
    expect((execute.files as Array<{ path: string }>).map((file) => file.path)).toEqual(["main.py", "helper.py"]);
    expect(execute.token).toBe(host.token);
    expect(execute.ns).toBe(RUNTIME_NAMESPACE);
  });

  it("sends a workspace held in component state, which cannot be cloned as it stands", async () => {
    // Svelte 5 state is a Proxy, and structured clone — what postMessage does — refuses one.
    const files = new Proxy([{ path: "main.py", content: "print(1)" }], {});
    const { kernel, host } = makeKernel();
    host.ready();
    void kernel.execute({ runtime: "python", mode: "script", entry: "main.py", files });
    await host.execution();

    const execute = host.sent.find((message) => message.type === "execute") as Record<string, unknown>;
    expect(execute.files).toEqual([{ path: "main.py", content: "print(1)" }]);
    expect(execute.files).not.toBe(files);
    expect(() => structuredClone(execute)).not.toThrow();
  });

  it("gathers streamed output into the result, in order", async () => {
    const { kernel, host } = makeKernel();
    host.ready();
    const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
    const id = await host.execution();

    host.reply({ type: "stream", id, stream: "stdout", text: "one\n" });
    host.reply({ type: "stream", id, stream: "stdout", text: "two\n" });
    host.reply({ type: "result", id, value: "42" });
    host.reply({ type: "done", id, ok: true, durationMs: 12 });

    await expect(run).resolves.toMatchObject({ ok: true, output: "one\ntwo\n", value: "42", durationMs: 12 });
  });

  it("keeps standard error apart from the run's output", async () => {
    const { kernel, host } = makeKernel();
    host.ready();
    const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
    const id = await host.execution();

    host.reply({ type: "stream", id, stream: "stdout", text: "working\n" });
    host.reply({ type: "stream", id, stream: "stderr", text: "warning\n" });
    host.reply({ type: "done", id, ok: true, durationMs: 1 });

    const result = await run;
    expect(result.output).toBe("working\nwarning\n");
    expect(result.stderr).toBe("warning\n");
  });

  it("reports code that failed as a failure, with the error in the output", async () => {
    const { kernel, host } = makeKernel();
    host.ready();
    const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
    const id = await host.execution();

    host.reply({ type: "error", id, message: "NameError: name 'x' is not defined" });
    host.reply({ type: "done", id, ok: false, durationMs: 3 });

    const result = await run;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("NameError");
    expect(result.output).toContain("NameError");
  });

  it("passes each run's events to whoever is listening", async () => {
    const seen: RuntimeEvent[] = [];
    const { kernel, host } = makeKernel();
    kernel.subscribe((event) => seen.push(event));

    host.ready();
    const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
    const id = await host.execution();
    host.reply({ type: "stream", id, stream: "stdout", text: "hello\n" });
    host.reply({ type: "done", id, ok: true, durationMs: 1 });
    await run;

    expect(seen.map((event) => event.type)).toEqual(["ready", "stream", "done"]);
  });

  it("lets a notebook watch the kernel while each cell listens only for its own run", () => {
    const notebook: string[] = [];
    const cell: string[] = [];
    const { kernel, host } = makeKernel();
    kernel.subscribe((event) => notebook.push(event.type));
    const unsubscribe = kernel.subscribe((event) => cell.push(event.type));

    host.ready();
    unsubscribe();
    host.reply({ type: "status", phase: "loading", detail: "Loading Python" });

    expect(notebook).toEqual(["ready", "status"]);
    expect(cell).toEqual(["ready"]);
  });

  it("keeps two runs' output apart", async () => {
    const { kernel, host } = makeKernel();
    host.ready();
    const first = kernel.execute({ id: "a", runtime: "python", mode: "cell", files: [], entry: "cell" });
    const second = kernel.execute({ id: "b", runtime: "python", mode: "cell", files: [], entry: "cell" });
    await host.execution();

    host.reply({ type: "stream", id: "b", stream: "stdout", text: "second\n" });
    host.reply({ type: "done", id: "b", ok: true, durationMs: 1 });
    host.reply({ type: "stream", id: "a", stream: "stdout", text: "first\n" });
    host.reply({ type: "done", id: "a", ok: true, durationMs: 1 });

    expect((await first).output).toBe("first\n");
    expect((await second).output).toBe("second\n");
  });
});

describe("Kernel: what it refuses", () => {
  it("ignores a message carrying the wrong token", () => {
    const seen: RuntimeEvent[] = [];
    const { kernel, host } = makeKernel();
    kernel.subscribe((event) => seen.push(event));
    host.reply({ type: "stream", id: "a", stream: "stdout", text: "not mine\n" }, { token: "some-other-kernel" });
    expect(seen).toEqual([]);
  });

  it("ignores a message from anywhere but its own frame", () => {
    const seen: RuntimeEvent[] = [];
    const { kernel, host } = makeKernel();
    kernel.subscribe((event) => seen.push(event));
    host.impersonate({ ns: RUNTIME_NAMESPACE, token: host.token, event: { type: "stream", id: "a", stream: "stdout", text: "hello\n" } });
    expect(seen).toEqual([]);
  });

  it("ignores traffic belonging to something else on the page", () => {
    const seen: RuntimeEvent[] = [];
    const { kernel, host } = makeKernel();
    kernel.subscribe((event) => seen.push(event));
    host.reply({ type: "ready", runtime: "python" }, { ns: "some-other-library" });
    expect(seen).toEqual([]);
  });

  it("ignores a message that carries no event at all", () => {
    const seen: RuntimeEvent[] = [];
    const { kernel, host } = makeKernel();
    kernel.subscribe((event) => seen.push(event));
    host.reply(undefined as unknown as RuntimeEvent);
    expect(seen).toEqual([]);
  });

  it("refuses to run anything once disposed", async () => {
    const { kernel } = makeKernel();
    kernel.dispose();
    await expect(kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" })).rejects.toThrow(/disposed/);
  });
});

describe("Kernel: when the sandbox goes quiet", () => {
  it("gives up on a run that outlives its ceiling, and says so", async () => {
    const { kernel, host } = makeKernel("python", 50);
    host.ready();
    const result = await kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/still running/);
    // The worker is discarded rather than interrupted, so the next run starts clean.
    expect(host.restarted()).toBe(true);
  });

  it("answers a stopped run rather than leaving the caller waiting", async () => {
    const { kernel, host } = makeKernel();
    host.ready();
    const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
    await host.execution();
    kernel.stop();

    const result = await run;
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Stopped.");
    expect(host.restarted()).toBe(true);
  });

  it("tells listeners a stopped run is over", async () => {
    const seen: RuntimeEvent[] = [];
    const { kernel, host } = makeKernel();
    host.ready();
    kernel.subscribe((event) => seen.push(event));
    const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
    await host.execution();
    kernel.stop();
    await run;

    expect(seen.map((event) => event.type)).toEqual(["error", "done"]);
  });

  it("ignores a late answer to a run that was already stopped", async () => {
    const { kernel, host } = makeKernel();
    host.ready();
    const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
    const id = await host.execution();
    kernel.stop();
    const result = await run;

    host.reply({ type: "stream", id, stream: "stdout", text: "too late\n" });
    host.reply({ type: "done", id, ok: true, durationMs: 1 });
    expect(result.output).not.toContain("too late");
  });

  it("does nothing when asked to stop with nothing running", () => {
    const { kernel, host } = makeKernel();
    host.ready();
    kernel.stop();
    expect(host.restarted()).toBe(false);
  });

  it("takes the frame down with it and stops listening", () => {
    const seen: RuntimeEvent[] = [];
    const { kernel, container, host } = makeKernel();
    kernel.subscribe((event) => seen.push(event));
    kernel.dispose();

    expect(container.querySelector("iframe")).toBeNull();
    host.reply({ type: "ready", runtime: "python" });
    expect(seen).toEqual([]);
  });
});
