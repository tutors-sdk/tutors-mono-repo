import { describe, expect, it, vi } from "vitest";
import type { ContentRenderer } from "../../../packages/application/src/ports/index.ts";
import type { Course, Lo } from "../../../packages/jsr/model/src/tutors.ts";
import { decorateCourseTree, setCompanionIconRegistrar } from "../../../packages/adapters/driving/svelte-state/src/course/services/lo-tree.ts";
import { anonymousReader } from "../../support/reader-adapters.ts";

// `rune()` wraps a value in `$state`, which needs the Svelte compiler; the tree only reads `.value`.
vi.mock("../../../packages/adapters/driving/svelte-state/src/index.svelte.ts", () => {
  const rune = <T>(value: T) => ({ value });
  return { rune, courseProtocol: rune("https://") };
});

anonymousReader();

const lo = (type: string, route: string, extra: Record<string, unknown> = {}) => ({ type, title: type, route, contentMd: `# ${type}`, summary: "", ...extra }) as unknown as Lo;

function course(properties: Record<string, unknown> = {}) {
  const talk = lo("talk", "/talk/{{COURSEURL}}/topic/talk-1");
  const web = lo("web", "https://example.com/elsewhere");
  const note = lo("note", "/note/{{COURSEURL}}/topic/note-1");
  const topic = lo("topic", "/topic/{{COURSEURL}}/topic", { los: [talk, web, note] });
  const root = lo("course", "/", { los: [topic], properties }) as unknown as Course;
  return { root, talk, web, note };
}

function recordingRenderer() {
  const rendered: string[] = [];
  const summarised: string[] = [];
  const renderer = {
    renderLo: (_course: Course, target: Lo) => void rendered.push(target.type),
    renderSummary: (target: Lo) => void summarised.push(target.type),
    renderMarkdown: (md: string) => md,
    mayContainMath: () => false,
    loadMath: async () => {}
  } as unknown as ContentRenderer;
  return { renderer, rendered, summarised };
}

describe("decorateCourseTree in the reader", () => {
  it("with no renderer renders nothing, and keeps web links out of the route index", () => {
    const { root, talk, web } = course();
    expect(() => decorateCourseTree(root, "cid", "cid.netlify.app")).not.toThrow();
    expect(root.loIndex.get("/talk/cid/topic/talk-1")).toBe(talk);
    expect([...root.loIndex.values()]).not.toContain(web);
    expect(talk.contentHtml).toBeUndefined();
  });

  it("with a renderer renders bodies now, except those the reader renders when opened", () => {
    const { root, web } = course();
    const { renderer, rendered, summarised } = recordingRenderer();
    decorateCourseTree(root, "cid", "cid.netlify.app", renderer);
    expect(rendered).toContain("talk");
    expect(rendered).not.toContain("note");
    expect(summarised).toEqual(["note"]);
    expect([...root.loIndex.values()]).not.toContain(web);
  });

  it("registers a custom companion's icon with whoever the theme installed", () => {
    const registered: unknown[] = [];
    setCompanionIconRegistrar((key, icon) => void registered.push([key, icon]));
    try {
      const { root } = course({ companions: { piazza: { icon: { type: "mdi:forum", color: "info" } }, plain: {} } });
      decorateCourseTree(root, "cid", "cid.netlify.app");
      expect(registered).toEqual([["piazza", { type: "mdi:forum", color: "info" }]]);
    } finally {
      setCompanionIconRegistrar(() => {});
    }
  });
});
