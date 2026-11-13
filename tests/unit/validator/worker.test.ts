import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), parse: vi.fn(async () => true) }));
vi.mock("../../../apps/validator/node_modules/mermaid/dist/mermaid.core.mjs", () => ({ default: mermaid }));
import { runValidation } from "../../../apps/validator/src/lib/worker.ts";

const workers: LocalWorker[] = [];
class LocalWorker {
  onmessage: ((event: MessageEvent) => void | Promise<void>) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(readonly url: URL) {
    workers.push(this);
  }
  emit(data: unknown) {
    return this.onmessage?.({ data } as MessageEvent);
  }
}

beforeEach(() => {
  workers.length = 0;
  vi.stubGlobal("Worker", LocalWorker);
});
afterEach(() => vi.unstubAllGlobals());

it("transfers ZIP bytes to a local worker and terminates it after the result", async () => {
  const bytes = new Uint8Array([1, 2]);
  const result = runValidation({ bytes }, new AbortController().signal);
  const worker = workers[0];
  expect(worker.url.pathname).toContain("validation-worker.ts");
  expect(worker.postMessage).toHaveBeenCalledWith({ bytes }, [bytes.buffer]);
  await worker.emit({ findings: [] });
  expect(await result).toEqual([]);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it("passes published data without creating an upload request", async () => {
  const course = { title: "Course" };
  const result = runValidation({ course }, new AbortController().signal);
  expect(workers[0].postMessage).toHaveBeenCalledWith({ course }, []);
  await workers[0].emit({ findings: [] });
  expect(await result).toEqual([]);
});

it("refuses a cancelled check before starting a worker", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(runValidation({ course: {} }, controller.signal)).rejects.toBe(controller.signal.reason);
  expect(workers).toHaveLength(0);
});

it("terminates a superseded check instead of accepting its result", async () => {
  const controller = new AbortController();
  const result = runValidation({ course: {} }, controller.signal);
  controller.abort();
  await expect(result).rejects.toBe(controller.signal.reason);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
});

it.each(["worker error", "start error"])("reports a %s instead of an all-clear", async (kind) => {
  const result = runValidation({ course: {} }, new AbortController().signal);
  const rejected = expect(result).rejects.toThrow();
  if (kind === "worker error") await workers[0].emit({ error: "This ZIP is unreadable." });
  else workers[0].onerror?.();
  await rejected;
  expect(workers[0].terminate).toHaveBeenCalledOnce();
});

it("answers diagram checks locally before the worker's final report", async () => {
  const result = runValidation({ bytes: new Uint8Array() }, new AbortController().signal);
  await workers[0].emit({ diagram: "flowchart TD\nA --> B" });
  expect(mermaid.initialize).toHaveBeenCalledWith({ startOnLoad: false, securityLevel: "strict" });
  expect(workers[0].postMessage).toHaveBeenLastCalledWith({ diagramResult: { draws: true } });
  await workers[0].emit({ findings: [] });
  expect(await result).toEqual([]);
});
