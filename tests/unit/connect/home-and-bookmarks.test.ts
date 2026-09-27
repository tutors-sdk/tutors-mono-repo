import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The home page's loaders and the bookmark service, each branch on its own:
 * signed out, the data API not answering, and a server that refuses a change.
 * The Rules themselves (0076 to 0079, 0150 to 0154) are bound in tests/bdd.
 */

const api = vi.hoisted(() => ({
  getHome: vi.fn(),
  getBookmarks: vi.fn(),
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
}));
const who = vi.hoisted(() => ({ value: null as { login: string } | null }));
const visits = vi.hoisted(() => vi.fn());

vi.mock("@tutors/data-api", () => ({ dataApi: api }));
vi.mock("../../../packages/svelte/data-api/src/index.ts", () => ({
  dataApi: api,
}));
vi.mock("@tutors/runes", () => ({
  tutorsId: who,
  rune: <T>(value: T) => ({ value }),
}));
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => ({
  tutorsId: who,
  rune: <T>(value: T) => ({ value }),
}));
vi.mock(
  "../../../packages/svelte/connect/src/services/connect.svelte.ts",
  () => ({ tutorsConnectService: { getCourseVisits: visits } }),
);

import { bookmarkService } from "../../../packages/svelte/connect/src/services/bookmarks.svelte.ts";
import {
  cardProgress,
  loadBookmarks,
  loadHome,
  loadProgress,
  teachingVisits,
  type HomeProgress,
} from "../../../packages/svelte/connect/src/services/home.ts";

const bookmark = {
  courseId: "web-dev-101",
  loRoute: "/lab/web-dev-101/lab-1",
  title: "Lab 1",
  loType: "lab",
  createdAt: "2026-09-26T10:00:00Z",
};
const visit = (id: string) => ({
  id,
  title: id,
  lastVisit: "2026-09-26T10:00:00Z",
  credits: "",
  visits: 1,
});
const progress = { opened: 1, total: 4, continueAt: null };

beforeEach(async () => {
  vi.resetAllMocks();
  who.value = null;
  await bookmarkService.load();
  who.value = { login: "alice" };
});

describe("loadProgress", () => {
  it("asks the data API for nothing when no one is signed in", async () => {
    who.value = null;
    expect(await loadProgress()).toEqual({ kind: "signed-out" });
    expect(api.getHome).not.toHaveBeenCalled();
  });

  it("is unavailable when the data API does not answer", async () => {
    api.getHome.mockResolvedValue(null);
    expect(await loadProgress()).toEqual({ kind: "unavailable" });
  });

  it("treats a missing teaching list as teaching nothing", async () => {
    api.getHome.mockResolvedValue({ courses: { "web-dev-101": progress } });
    expect(await loadProgress()).toEqual({
      kind: "ready",
      courses: { "web-dev-101": progress },
      teaching: [],
    });
  });
});

describe("loadBookmarks", () => {
  it("is null when no one is signed in", async () => {
    who.value = null;
    expect(await loadBookmarks()).toBeNull();
    expect(api.getBookmarks).not.toHaveBeenCalled();
  });

  it("is unavailable when the data API does not answer", async () => {
    api.getBookmarks.mockResolvedValue(null);
    expect(await loadBookmarks()).toBe("unavailable");
  });

  it("is the reader's bookmarks otherwise", async () => {
    api.getBookmarks.mockResolvedValue({ bookmarks: [bookmark] });
    expect(await loadBookmarks()).toEqual([bookmark]);
  });
});

describe("loadHome", () => {
  it("gathers the visits, progress and bookmarks together", async () => {
    visits.mockResolvedValue([visit("web-dev-101")]);
    api.getHome.mockResolvedValue({ courses: {}, teaching: ["web-dev-101"] });
    api.getBookmarks.mockResolvedValue({ bookmarks: [] });
    expect(await loadHome()).toEqual({
      visits: [visit("web-dev-101")],
      progress: { kind: "ready", courses: {}, teaching: ["web-dev-101"] },
      bookmarks: [],
    });
  });
});

describe("cardProgress", () => {
  it("shows nothing signed out", () => {
    expect(cardProgress({ kind: "signed-out" }, "web-dev-101")).toBeNull();
  });

  it("is unavailable when the page's progress is", () => {
    expect(cardProgress({ kind: "unavailable" }, "web-dev-101")).toBe(
      "unavailable",
    );
  });

  it("is the course's count, or unavailable when the course could not be read", () => {
    const ready: HomeProgress = {
      kind: "ready",
      courses: { "web-dev-101": progress, "gone-101": null },
      teaching: [],
    };
    expect(cardProgress(ready, "web-dev-101")).toEqual(progress);
    expect(cardProgress(ready, "gone-101")).toBe("unavailable");
    expect(cardProgress(ready, "never-read")).toBe("unavailable");
  });
});

describe("teachingVisits", () => {
  it("is empty unless progress is ready", () => {
    expect(
      teachingVisits({ kind: "unavailable" }, [visit("web-dev-101")]),
    ).toEqual([]);
  });

  it("keeps the taught courses in profile order", () => {
    const ready: HomeProgress = {
      kind: "ready",
      courses: {},
      teaching: ["b", "a"],
    };
    expect(
      teachingVisits(ready, [visit("a"), visit("c"), visit("b")]).map(
        (v) => v.id,
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("bookmarkService", () => {
  it("clears the list and asks for nothing when no one is signed in", async () => {
    api.getBookmarks.mockResolvedValue({ bookmarks: [bookmark] });
    await bookmarkService.load();
    who.value = null;
    expect(await bookmarkService.load()).toEqual([]);
    expect(bookmarkService.bookmarks).toEqual([]);
    expect(api.getBookmarks).toHaveBeenCalledTimes(1);
  });

  it("keeps the last list when the data API does not answer", async () => {
    api.getBookmarks
      .mockResolvedValueOnce({ bookmarks: [bookmark] })
      .mockResolvedValueOnce(null);
    await bookmarkService.load();
    expect(await bookmarkService.load()).toBeNull();
    expect(
      bookmarkService.isBookmarked(bookmark.courseId, bookmark.loRoute),
    ).toBe(true);
  });

  it("adds a page that is not bookmarked and reloads", async () => {
    api.addBookmark.mockResolvedValue({ ok: true });
    api.getBookmarks.mockResolvedValue({ bookmarks: [bookmark] });
    expect(
      await bookmarkService.toggle(bookmark.courseId, bookmark.loRoute),
    ).toBe(true);
    expect(api.addBookmark).toHaveBeenCalledWith({
      courseId: bookmark.courseId,
      loRoute: bookmark.loRoute,
    });
    expect(bookmarkService.bookmarks).toEqual([bookmark]);
  });

  it("removes a page that is bookmarked", async () => {
    api.getBookmarks
      .mockResolvedValueOnce({ bookmarks: [bookmark] })
      .mockResolvedValueOnce({ bookmarks: [] });
    await bookmarkService.load();
    api.removeBookmark.mockResolvedValue({ ok: true });
    expect(
      await bookmarkService.toggle(bookmark.courseId, bookmark.loRoute),
    ).toBe(true);
    expect(api.removeBookmark).toHaveBeenCalled();
    expect(bookmarkService.bookmarks).toEqual([]);
  });

  it("reports false when the server refuses or does not answer", async () => {
    api.addBookmark
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(null);
    expect(
      await bookmarkService.toggle(bookmark.courseId, bookmark.loRoute),
    ).toBe(false);
    expect(
      await bookmarkService.toggle(bookmark.courseId, bookmark.loRoute),
    ).toBe(false);
    expect(api.getBookmarks).not.toHaveBeenCalled();
  });

  it("changes nothing when no one is signed in", async () => {
    who.value = null;
    expect(
      await bookmarkService.toggle(bookmark.courseId, bookmark.loRoute),
    ).toBe(false);
    expect(api.addBookmark).not.toHaveBeenCalled();
  });
});
