// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { inertFrames, makeKernel } from "../../../support/runtime-kernel-harness";
import { RUNTIME_NAMESPACE, type RuntimeEvent } from "../../../../packages/svelte/utils/runtime/src/types";
import { decodeShareLink, encodeShareLink, isReadOnly, memoryStore, mergeWorkspace } from "../../../../packages/svelte/utils/runtime/src/workspace";
import type { Playground } from "../../../../packages/jsr/model/src/types/learning-objects";

/**
 * A student working through a playground, from the page's side of the sandbox.
 *
 * The run-time itself is a stand-in: what these check is the behaviour a student would
 * notice — that their code runs somewhere it cannot touch the reader, that their work
 * survives, and that nothing hangs when the code does.
 */

function playgroundLo(files: Playground["files"], extra: Partial<Playground> = {}): Playground {
  return { type: "playground", runtime: "python", entry: "main.py", files, ...extra } as Playground;
}

beforeEach(() => inertFrames());

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("Student: Playground Coding", () => {
  describe("Student code never runs on the reader's own origin", () => {
    it("shall run the code in a frame that cannot reach the reader's origin", () => {
      const { container } = makeKernel();
      const frame = container.querySelector("iframe") as HTMLIFrameElement;

      expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
      expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    });

    it("shall address that frame with a token of its own", () => {
      const first = makeKernel();
      const second = makeKernel();

      expect(first.host.token).not.toBe("");
      expect(first.host.token).not.toBe(second.host.token);
    });

    it("shall ignore run-time messages from anywhere else on the page", () => {
      const seen: RuntimeEvent[] = [];
      const { kernel, host } = makeKernel();
      kernel.subscribe((event) => seen.push(event));

      host.impersonate({ ns: RUNTIME_NAMESPACE, token: host.token, event: { type: "ready", runtime: "python" } });
      host.reply({ type: "ready", runtime: "python" }, { token: "another-kernel" });

      expect(seen).toEqual([]);
    });
  });

  describe("WHEN the student runs the code", () => {
    it("shall send the whole workspace to the run-time", async () => {
      const { kernel, host } = makeKernel();
      host.ready();
      void kernel.execute({
        runtime: "python",
        mode: "script",
        entry: "main.py",
        files: [
          { path: "main.py", content: "from helper import double" },
          { path: "helper.py", content: "def double(n): return n * 2" }
        ]
      });
      await host.execution();

      const execute = host.sent.find((message) => message.type === "execute") as Record<string, unknown>;
      expect((execute.files as Array<{ path: string }>).map((file) => file.path)).toEqual(["main.py", "helper.py"]);
    });

    it("shall show output as it arrives", async () => {
      const streamed: string[] = [];
      const { kernel, host } = makeKernel();
      kernel.subscribe((event) => void (event.type === "stream" && streamed.push(event.text)));
      host.ready();

      const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
      const id = await host.execution();
      host.reply({ type: "stream", id, stream: "stdout", text: "42\n" });
      expect(streamed).toEqual(["42\n"]);

      host.reply({ type: "done", id, ok: true, durationMs: 1 });
      await run;
    });

    it("shall report whether the run succeeded", async () => {
      const { kernel, host } = makeKernel();
      host.ready();

      const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
      const id = await host.execution();
      host.reply({ type: "error", id, message: "SyntaxError: invalid syntax" });
      host.reply({ type: "done", id, ok: false, durationMs: 2 });

      const result = await run;
      expect(result.ok).toBe(false);
      expect(result.output).toContain("SyntaxError");
    });
  });

  describe("WHEN the student runs the checks", () => {
    const lo = playgroundLo([{ path: "main.py", content: "def double(n): return n" }], {
      tests: { path: "test_main.py", content: "assert double(2) == 4" }
    });

    it("shall send the tests alongside the student's files", async () => {
      const { kernel, host } = makeKernel();
      host.ready();
      void kernel.execute({
        runtime: "python",
        mode: "test",
        entry: lo.entry,
        files: [...mergeWorkspace(lo, null), { path: lo.tests!.path, content: lo.tests!.content }]
      });
      await host.execution();

      const execute = host.sent.find((message) => message.type === "execute") as Record<string, unknown>;
      expect(execute.mode).toBe("test");
      expect((execute.files as Array<{ path: string }>).map((file) => file.path)).toEqual(["main.py", "test_main.py"]);
    });

    it("shall keep the tests out of the student's own workspace", () => {
      expect(mergeWorkspace(lo, null).map((file) => file.path)).toEqual(["main.py"]);
    });
  });

  describe("WHILE a student has edited a playground before", () => {
    const lo = playgroundLo([{ path: "main.py", content: "print('todo')" }]);

    it("shall reopen the exercise with their edits in place", async () => {
      const store = memoryStore();
      await store.save({ courseId: "course", loId: "lo", files: [{ path: "main.py", content: "print('done')" }], entry: "main.py", updatedAt: "2026-09-10T09:00:00.000Z" });

      const reopened = mergeWorkspace(lo, await store.load("course", "lo"));
      expect(reopened[0].content).toBe("print('done')");
    });

    it("shall keep the files the student created themselves", async () => {
      const store = memoryStore();
      await store.save({
        courseId: "course",
        loId: "lo",
        files: [
          { path: "main.py", content: "print('done')" },
          { path: "scratch.py", content: "# working it out" }
        ],
        entry: "main.py",
        updatedAt: "2026-09-10T09:00:00.000Z"
      });

      const reopened = mergeWorkspace(lo, await store.load("course", "lo"));
      expect(reopened.map((file) => file.path)).toContain("scratch.py");
    });
  });

  describe("WHEN the lecturer adds a file to the exercise", () => {
    const saved = { courseId: "course", loId: "lo", files: [{ path: "main.py", content: "print('mine')" }], entry: "main.py", updatedAt: "2026-09-10T09:00:00.000Z" };
    const updated = playgroundLo([
      { path: "main.py", content: "print('todo')" },
      { path: "helper.py", content: "def double(n): return n * 2" }
    ]);

    it("shall deliver the new file to the student", () => {
      expect(mergeWorkspace(updated, saved).map((file) => file.path)).toContain("helper.py");
    });

    it("shall leave the student's edits alone", () => {
      const merged = mergeWorkspace(updated, saved);
      expect(merged.find((file) => file.path === "main.py")?.content).toBe("print('mine')");
    });
  });

  describe("WHERE the author marked a file read-only", () => {
    const lo = playgroundLo([
      { path: "scaffold.py", content: "VERSION = 2", readOnly: true },
      { path: "main.py", content: "print('todo')" }
    ]);

    it("shall present that file as read-only", () => {
      expect(isReadOnly(lo, "scaffold.py")).toBe(true);
      expect(isReadOnly(lo, "main.py")).toBe(false);
    });

    it("shall ship the current version of it rather than a stored copy", () => {
      const saved = { courseId: "course", loId: "lo", files: [{ path: "scaffold.py", content: "VERSION = 1" }], entry: "main.py", updatedAt: "2026-09-10T09:00:00.000Z" };
      expect(mergeWorkspace(lo, saved)[0].content).toBe("VERSION = 2");
    });
  });

  describe("WHEN the student shares it as a link", () => {
    const files = [
      { path: "main.py", content: "print('look at this')" },
      { path: "helper.py", content: "def double(n): return n * 2" }
    ];

    it("shall carry the whole workspace in the link", async () => {
      const decoded = await decodeShareLink(await encodeShareLink(files, "main.py"));
      expect(decoded).toEqual({ files, entry: "main.py" });
    });

    it("shall keep the link's payload in the fragment, out of the network", async () => {
      const encoded = await encodeShareLink(files, "main.py");
      const url = new URL(`https://reader.test/playground/course/topic/lo#w=${encoded}`);

      expect(url.hash.slice(3)).toBe(encoded);
      expect(url.search).toBe("");
    });
  });

  describe("IF the code is still running after the time limit", () => {
    it("shall stop it and say so", async () => {
      const { kernel, host } = makeKernel("python", 50);
      host.ready();

      const result = await kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/still running/);
    });

    it("shall discard the run-time rather than leave it stuck", async () => {
      const { kernel, host } = makeKernel("python", 50);
      host.ready();

      await kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
      expect(host.restarted()).toBe(true);
    });
  });

  describe("IF the student presses stop", () => {
    it("shall answer the waiting run rather than leave the page busy", async () => {
      const { kernel, host } = makeKernel();
      host.ready();

      const run = kernel.execute({ runtime: "python", mode: "script", files: [], entry: "main.py" });
      await host.execution();
      kernel.stop();

      const result = await run;
      expect(result.ok).toBe(false);
      expect(result.output).toContain("Stopped.");
    });
  });

  describe("IF a link's fragment is not a workspace", () => {
    it("shall fall back to the exercise as authored", async () => {
      const lo = playgroundLo([{ path: "main.py", content: "print('todo')" }]);
      const link = await decodeShareLink("something-someone-typed");

      expect(link).toBeNull();
      expect(mergeWorkspace(lo, null)).toEqual([{ path: "main.py", content: "print('todo')" }]);
    });
  });
});
