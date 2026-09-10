import { describe, it, expect } from "vitest";
import { decodeShareLink, encodeShareLink, isReadOnly, memoryStore, mergeWorkspace, type Workspace } from "../../../packages/svelte/utils/runtime/src/workspace.ts";
import type { Playground, PlaygroundFile } from "../../../packages/jsr/model/src/types/learning-objects.ts";
import type { RuntimeFile } from "../../../packages/svelte/utils/runtime/src/types.ts";

/**
 * A student's work: what it is made of, and what happens to it between visits.
 *
 * The rules worth pinning down are the ones a student would notice going wrong — edits
 * quietly reverted, a lecturer's correction never arriving, or a shared link that opens
 * as somebody else's exercise.
 */

function playground(files: PlaygroundFile[], entry = "main.py"): Playground {
  return { type: "playground", runtime: "python", entry, files } as Playground;
}

function saved(files: RuntimeFile[], entry = "main.py"): Workspace {
  return { courseId: "course", loId: "/playground/course/topic/lo", files, entry, updatedAt: "2026-09-10T09:00:00.000Z" };
}

describe("mergeWorkspace", () => {
  it("gives a student who has never been here the exercise as authored", () => {
    const merged = mergeWorkspace(playground([{ path: "main.py", content: "print(1)" }]), null);
    expect(merged).toEqual([{ path: "main.py", content: "print(1)" }]);
  });

  it("keeps the student's edits over the authored content", () => {
    const merged = mergeWorkspace(playground([{ path: "main.py", content: "print(1)" }]), saved([{ path: "main.py", content: "print(2)" }]));
    expect(merged).toEqual([{ path: "main.py", content: "print(2)" }]);
  });

  it("delivers a file the lecturer added after the student started", () => {
    const merged = mergeWorkspace(
      playground([
        { path: "main.py", content: "print(1)" },
        { path: "helper.py", content: "def help(): ..." }
      ]),
      saved([{ path: "main.py", content: "print(2)" }])
    );
    expect(merged.map((file) => file.path)).toEqual(["main.py", "helper.py"]);
    expect(merged[1].content).toBe("def help(): ...");
  });

  it("keeps files the student created themselves", () => {
    const merged = mergeWorkspace(
      playground([{ path: "main.py", content: "print(1)" }]),
      saved([
        { path: "main.py", content: "print(2)" },
        { path: "scratch.py", content: "# mine" }
      ])
    );
    expect(merged).toContainEqual({ path: "scratch.py", content: "# mine" });
  });

  it("keeps a stored file the lecturer has since removed, which reads as the student's own", () => {
    const merged = mergeWorkspace(
      playground([{ path: "main.py", content: "print(1)" }]),
      saved([
        { path: "main.py", content: "print(2)" },
        { path: "helper.py", content: "the student may have edited this" }
      ])
    );
    // Storage does not record who created a file, so a withdrawn scaffold and a file the
    // student made look the same. Keeping it is the side that cannot lose anyone's work.
    expect(merged.map((file) => file.path)).toEqual(["main.py", "helper.py"]);
  });

  it("refreshes a read-only file rather than restoring the stored copy", () => {
    const merged = mergeWorkspace(
      playground([{ path: "scaffold.py", content: "VERSION = 2", readOnly: true }], "scaffold.py"),
      saved([{ path: "scaffold.py", content: "VERSION = 1" }])
    );
    expect(merged[0].content).toBe("VERSION = 2");
  });

  it("builds a workspace for a playground with no files at all", () => {
    expect(mergeWorkspace({ type: "playground" } as Playground, null)).toEqual([]);
  });
});

describe("isReadOnly", () => {
  const lo = playground([
    { path: "scaffold.py", content: "", readOnly: true },
    { path: "main.py", content: "" }
  ]);

  it("is true only for a file the author locked", () => {
    expect(isReadOnly(lo, "scaffold.py")).toBe(true);
    expect(isReadOnly(lo, "main.py")).toBe(false);
  });

  it("is false for a file the student added, which the author never saw", () => {
    expect(isReadOnly(lo, "scratch.py")).toBe(false);
  });
});

describe("memoryStore", () => {
  it("returns nothing for a workspace it was never given", async () => {
    expect(await memoryStore().load("course", "lo")).toBeNull();
  });

  it("keeps workspaces apart by course and learning object", async () => {
    const store = memoryStore();
    await store.save({ ...saved([{ path: "main.py", content: "one" }]), courseId: "a", loId: "lo" });
    await store.save({ ...saved([{ path: "main.py", content: "two" }]), courseId: "b", loId: "lo" });
    expect((await store.load("a", "lo"))?.files[0].content).toBe("one");
    expect((await store.load("b", "lo"))?.files[0].content).toBe("two");
  });

  it("forgets a workspace that was removed", async () => {
    const store = memoryStore();
    await store.save(saved([{ path: "main.py", content: "one" }]));
    await store.remove("course", "/playground/course/topic/lo");
    expect(await store.load("course", "/playground/course/topic/lo")).toBeNull();
  });
});

describe("share links", () => {
  const files: RuntimeFile[] = [
    { path: "main.py", content: "print('héllo — ünicode')\n" },
    { path: "helper.py", content: "def double(n):\n    return n * 2\n" }
  ];

  it("carries a whole workspace there and back", async () => {
    const decoded = await decodeShareLink(await encodeShareLink(files, "main.py"));
    expect(decoded).toEqual({ files, entry: "main.py" });
  });

  it("produces something that survives being put in a URL", async () => {
    const encoded = await encodeShareLink(files, "main.py");
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it("compresses, so a realistic workspace fits in a link", async () => {
    const repetitive = [{ path: "main.py", content: "print('hello')\n".repeat(400) }];
    const encoded = await encodeShareLink(repetitive, "main.py");
    expect(encoded.length).toBeLessThan(JSON.stringify(repetitive).length / 4);
    expect((await decodeShareLink(encoded))?.files).toEqual(repetitive);
  });

  it("reads a link made where compression was unavailable", async () => {
    const plain = Buffer.from(JSON.stringify({ v: 1, entry: "main.py", files })).toString("base64url");
    expect(await decodeShareLink(plain)).toEqual({ files, entry: "main.py" });
  });

  it("returns nothing for a fragment that is not a share link", async () => {
    expect(await decodeShareLink("not-a-link")).toBeNull();
    expect(await decodeShareLink("")).toBeNull();
    expect(await decodeShareLink(Buffer.from('{"v":1}').toString("base64url"))).toBeNull();
  });
});
