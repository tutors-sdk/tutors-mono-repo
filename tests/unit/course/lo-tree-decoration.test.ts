import { describe, expect, it, vi } from "vitest";
import type { ContentRenderer } from "../../../packages/application/src/ports/index.ts";
import type { Course, Lo } from "../../../packages/jsr/model/src/tutors.ts";
import { decorateCourseTree, readerDecoration, setCompanionIconRegistrar } from "../../../packages/adapters/driving/svelte-state/src/course/services/lo-tree.ts";
import { anonymousReader } from "../../support/reader-adapters.ts";
import { addTransport, removeTransport, type LogEntry } from "../../../packages/platform/logger-core/src/index.ts";

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
  describe("a calendar that cannot be read", () => {
    const logged = (run: () => void): LogEntry[] => {
      const entries: LogEntry[] = [];
      const transport = (entry: LogEntry) => void entries.push(entry);
      const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
      addTransport(transport);
      try {
        run();
      } finally {
        removeTransport(transport);
        quiet.mockRestore();
      }
      return entries;
    };

    it("is logged as a warning that names the course, and the course is still decorated", () => {
      const { root } = course();
      (root as unknown as { calendar: unknown }).calendar = { title: "S1", weeks: [null] };
      const entries = logged(() => decorateCourseTree(root, "cid", "cid.netlify.app"));
      expect(entries).toEqual([expect.objectContaining({ level: "warn", message: "Error loading calendar", courseId: "cid", error: expect.stringMatching(/.+/) })]);
      expect(root.loIndex.size).toBeGreaterThan(0);
      expect(root.courseCalendar).toBeUndefined();
    });

    it("logs the same warning when the course is loaded through the reader's decoration", () => {
      const { root } = course();
      const entries = logged(() => readerDecoration(recordingRenderer().renderer).faulted?.({ ...root, courseId: "cid" } as Course, [{ part: "calendar", message: "bad weeks" }]));
      expect(entries).toEqual([expect.objectContaining({ level: "warn", message: "Error loading calendar", courseId: "cid", error: "bad weeks" })]);
    });

    it("logs nothing for a course whose calendar reads", () => {
      const { root } = course();
      (root as unknown as { calendar: unknown }).calendar = { title: "S1", weeks: [{ "2026-09-07": { title: "One", type: "topic" } }] };
      expect(logged(() => decorateCourseTree(root, "cid", "cid.netlify.app"))).toEqual([]);
      expect(root.courseCalendar?.weeks).toHaveLength(1);
    });
  });
});
