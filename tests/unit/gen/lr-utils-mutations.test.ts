import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  getFileWithName,
  getFileWithType,
  getImage,
  getImageFile,
  getArchive,
  getArchiveFile,
  getWebLink,
  getGitLink,
  getPodcastEpisode,
  getLabImage,
  getLabImageFile,
  getPdf,
  getPdfFile,
  getVideo,
  getMarkdown,
  readVideoIds,
  readYaml,
  removeLeadingHashes,
} from "../../../packages/jsr/gen/src/utils/lr-utils.ts";
import type { LearningResource } from "../../../packages/jsr/gen/src/types/types.ts";

/**
 * Behaviour of the filesystem-reading helpers in lr-utils.ts, driven by real
 * files written to a temporary directory, plus edge cases of the pure helpers.
 */

let dir = "";

function write(name: string, contents: string): string {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contents);
  return p;
}

function lr(overrides: Partial<LearningResource> = {}): LearningResource {
  return {
    courseRoot: "/root/course",
    route: "/root/course/topic/unit-1",
    id: "unit-1",
    lrs: [],
    files: [],
    type: "talk",
    ...overrides,
  };
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lr-utils-mut-"));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("getFileWithName path handling", () => {
  it("strips both forward and back slash directories before comparing names", () => {
    expect(getFileWithName(lr({ files: ["C:\\course\\weburl"] }), "weburl")).toBe("C:\\course\\weburl");
    expect(getFileWithName(lr({ files: ["/a/b/weburl"] }), "b/weburl")).toBe("");
  });
});

describe("getFileWithType ordering", () => {
  it("returns the first matching file, not a later one", () => {
    expect(getFileWithType(lr({ files: ["/x/a.txt", "/x/one.png", "/x/two.png"] }), ["png"])).toBe("/x/one.png");
  });
});

describe("file name helpers strip every directory level", () => {
  const files = [
    "/root/course/topic/unit-1/pics/cover.png",
    "/root/course/topic/unit-1/dl/code.zip",
    "/root/course/topic/unit-1/docs/notes.pdf",
  ];
  it("image", () => {
    expect(getImageFile(lr({ files }))).toBe("cover.png");
    expect(getImage(lr({ files }))).toBe("https://{{COURSEURL}}/topic/unit-1/pics/cover.png");
  });
  it("archive", () => {
    expect(getArchiveFile(lr({ files }))).toBe("code.zip");
    expect(getArchive(lr({ files }))).toBe("https://{{COURSEURL}}/topic/unit-1/dl/code.zip");
  });
  it("pdf", () => {
    expect(getPdfFile(lr({ files }))).toBe("notes.pdf");
    expect(getPdf(lr({ files }))).toBe("https://{{COURSEURL}}/topic/unit-1/docs/notes.pdf");
  });
  it("backslash separated paths", () => {
    expect(getImageFile(lr({ files: ["C:\\c\\x.png"] }))).toBe("x.png");
    expect(getArchiveFile(lr({ files: ["C:\\c\\x.zip"] }))).toBe("x.zip");
    expect(getPdfFile(lr({ files: ["C:\\c\\x.pdf"] }))).toBe("x.pdf");
  });
  it("returns empty strings when nothing matches", () => {
    const none = lr({ files: ["/root/course/readme.md"] });
    expect(getImage(none)).toBe("");
    expect(getArchive(none)).toBe("");
    expect(getPdf(none)).toBe("");
    expect(getImageFile(none)).toBe("");
    expect(getArchiveFile(none)).toBe("");
    expect(getPdfFile(none)).toBe("");
  });
});

describe("lab image helpers", () => {
  const imgLr = lr({
    id: "img",
    files: ["/root/course/topic/book-1/img/other.png", "/root/course/topic/book-1/img/main.png", "/root/course/topic/book-1/img/notes.txt"],
  });
  it("picks only the /img/main image from the img child", () => {
    const lab = lr({ lrs: [lr({ id: "other", files: ["/root/course/x/img/main.jpg"] }), imgLr] });
    expect(getLabImage(lab)).toBe("https://{{COURSEURL}}/topic/book-1/img/main.png");
    expect(getLabImageFile(lab)).toBe("main.png");
  });
  it("uses the first img child only", () => {
    const lab = lr({ lrs: [lr({ id: "img", files: [] }), imgLr] });
    expect(getLabImage(lab)).toBe("");
    expect(getLabImageFile(lab)).toBe("");
  });
  it("keeps the /img/main image even when another image follows it", () => {
    const lab = lr({ lrs: [lr({ id: "img", files: ["/root/course/t/img/main.png", "/root/course/t/img/zzz.png"] })] });
    expect(getLabImage(lab)).toBe("https://{{COURSEURL}}/t/img/main.png");
    expect(getLabImageFile(lab)).toBe("main.png");
  });
  it("ignores non-image files under /img/main", () => {
    const lab = lr({ lrs: [lr({ id: "img", files: ["/root/course/t/img/main.txt"] })] });
    expect(getLabImage(lab)).toBe("");
    expect(getLabImageFile(lab)).toBe("");
  });
});

describe("getVideo", () => {
  it("builds a video route relative to the course root", () => {
    expect(getVideo(lr(), "abc")).toBe("/video/{{COURSEURL}}/topic/unit-1/abc");
  });
  it("returns empty string without an id", () => {
    expect(getVideo(lr(), "")).toBe("");
  });
});

describe("removeLeadingHashes", () => {
  it("keeps text after the last hash", () => {
    expect(removeLeadingHashes("## Title")).toBe(" Title");
    expect(removeLeadingHashes("a#b#c")).toBe("c");
  });
  it("handles a hash at index 0 and no hash", () => {
    expect(removeLeadingHashes("#x")).toBe("x");
    expect(removeLeadingHashes("plain")).toBe("plain");
    expect(removeLeadingHashes("")).toBe("");
  });
});

describe("no spurious missing-file warnings", () => {
  it("does not try to read an episode or markdown file that is not there", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(getPodcastEpisode(lr({ files: ["/x/a.png"] }))).toEqual({ service: "spotify", id: "" });
      expect(getMarkdown(lr({ files: ["/x/a.png"] }))).toEqual(["", "", "", {}]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("getWebLink / getGitLink", () => {
  it("returns the first line of the weburl file without carriage return", () => {
    const f = write("web/weburl", "https://example.com/page\r\nsecond line\n");
    expect(getWebLink(lr({ files: ["/other/readme.md", f] }))).toBe("https://example.com/page");
  });
  it("returns the first line of the githubid file", () => {
    const f = write("git/githubid", "https://github.com/org/repo\nignored\n");
    expect(getGitLink(lr({ files: [f] }))).toBe("https://github.com/org/repo");
  });
  it("returns empty string when the files are missing", () => {
    expect(getWebLink(lr({ files: [] }))).toBe("");
    expect(getGitLink(lr({ files: [path.join(dir, "absent/githubid")] }))).toBe("");
  });
  it("does not read a weburl file as the githubid", () => {
    const f = write("both/weburl", "https://web.example\n");
    expect(getGitLink(lr({ files: [f] }))).toBe("");
  });
});

describe("getPodcastEpisode", () => {
  it("defaults to spotify with an empty id when there is no episode file", () => {
    expect(getPodcastEpisode(lr())).toEqual({ service: "spotify", id: "" });
  });
  it("parses a name=value first line, trimming whitespace", () => {
    const f = write("pod1/episode", "  apple = 12345  \nnext=line\n");
    expect(getPodcastEpisode(lr({ files: [f] }))).toEqual({ service: "apple", id: "12345" });
  });
  it("removes interior carriage returns from name and value", () => {
    const f = write("pod2/episode", "ap\r\rple=12\r34\n");
    // readFirstLineFromFile strips the first \r; the parser strips one more from each side
    expect(getPodcastEpisode(lr({ files: [f] }))).toEqual({ service: "apple", id: "1234" });
  });
  it("keeps the default when the first line has no '='", () => {
    const f = write("pod3/episode", "justanid\n");
    expect(getPodcastEpisode(lr({ files: [f] }))).toEqual({ service: "spotify", id: "" });
  });
  it("keeps the default when the first line is empty", () => {
    const f = write("pod4/episode", "\nspotify=abc\n");
    expect(getPodcastEpisode(lr({ files: [f] }))).toEqual({ service: "spotify", id: "" });
  });
});

describe("getMarkdown", () => {
  it("returns empty values when no markdown file exists", () => {
    expect(getMarkdown(lr({ files: ["/x/a.png"] }))).toEqual(["", "", "", {}]);
    expect(getMarkdown(lr({ files: ["/x/a.md"] }), "named.md")).toEqual(["", "", "", {}]);
  });
  it("parses front matter, title, summary and body from the first .md file", () => {
    const f = write("md1/note.md", "---\nicon: star\norder: 3\n---\n# The Title\n\nFirst para.\nSecond line.\n");
    const [title, summary, body, fm] = getMarkdown(lr({ files: ["/x/a.png", f] }));
    expect(title).toBe("The Title");
    expect(summary).toBe("First para.");
    expect(body).toBe("# The Title\n\nFirst para.\nSecond line.\n");
    expect(fm).toEqual({ icon: "star", order: 3 });
  });
  it("reads the named file rather than the first .md when a key file is given", () => {
    const first = write("md2/aaa.md", "# First\nbody a\n");
    const named = write("md2/key.md", "# Keyed\nbody k\n");
    const res = getMarkdown(lr({ files: [first, named] }), "key.md");
    expect(res[0]).toBe("Keyed");
    expect(res[1]).toBe("body k");
    expect(res[3]).toEqual({});
  });
});

describe("readVideoIds", () => {
  it("returns empty ids when no videoid file", () => {
    expect(readVideoIds(lr())).toEqual({ videoid: "", videoIds: [] });
  });
  it("reads a single youtube id", () => {
    const f = write("v1/videoid", "abc123");
    expect(readVideoIds(lr({ files: [f] }))).toEqual({
      videoid: "abc123",
      videoIds: [{ service: "youtube", id: "abc123" }],
    });
  });
  it("parses heanet, vimp and panopto entries, skips blank lines, and uses the last id", () => {
    const f = write("v2/videoid", "yt1\n\nheanet=h1\r\nvimp=v=1\npanopto=host|p1\n");
    const res = readVideoIds(lr({ files: [f] }));
    expect(res.videoIds).toEqual([
      { service: "youtube", id: "yt1" },
      { service: "heanet", id: "h1" },
      { service: "vimp", id: "v=1" },
      { service: "panopto", id: "host|p1" },
    ]);
    expect(res.videoid).toBe("host|p1");
  });
  it("strips a carriage return from the service name", () => {
    const f = write("v3/videoid", "heanet\r=x\n");
    expect(readVideoIds(lr({ files: [f] })).videoIds).toEqual([{ service: "heanet", id: "x" }]);
  });
  it("uses the last youtube id as videoid when several are listed", () => {
    const f = write("v4/videoid", "first\nsecond\n");
    const res = readVideoIds(lr({ files: [f] }));
    expect(res.videoid).toBe("second");
    expect(res.videoIds).toHaveLength(2);
  });
});

describe("readYaml", () => {
  it("returns null when there is no properties.yaml", () => {
    expect(readYaml(lr({ files: ["/x/other.yaml"] }))).toBeNull();
  });
  it("parses properties.yaml", () => {
    const f = write("y1/properties.yaml", "credits: Someone\nlist:\n  - a\n  - b\n");
    expect(readYaml(lr({ files: [f] }))).toEqual({ credits: "Someone", list: ["a", "b"] });
  });
  it("wraps a parse error with a helpful message and the original cause", () => {
    const f = write("y2/properties.yaml", "a: [unclosed\n  b: :\n");
    let err: unknown;
    try {
      readYaml(lr({ files: [f] }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const e = err as Error;
    expect(e.message).toMatch(/^Tutors encountered an error reading properties\.yaml: .+\. Review this file and try again\.$/s);
    expect(e.cause).toBeInstanceOf(Error);
    expect(e.message).toContain((e.cause as Error).message);
  });
  it("wraps a missing-file error too", () => {
    const missing = path.join(dir, "nope/properties.yaml");
    expect(() => readYaml(lr({ files: [missing] }))).toThrow(/ENOENT/);
  });
});
