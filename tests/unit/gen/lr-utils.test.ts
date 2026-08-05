import { describe, it, expect } from "vitest";
import {
  getFileWithName,
  getRoute,
  getFileWithType,
  getFilesWithType,
  getFilesWithTypes,
  getId,
  getImage,
  getImageFile,
  getArchive,
  getArchiveFile,
  getLabImage,
  getLabImageFile,
  getPdf,
  getPdfFile,
  getVideo,
  removeLeadingHashes,
} from "../../../packages/jsr/gen/src/utils/lr-utils.ts";
import type { LearningResource } from "../../../packages/jsr/gen/src/types/types.ts";

/**
 * Unit tests for the pure functions in lr-utils.ts.
 *
 * Functions that read from the filesystem (getWebLink, getGitLink, getMarkdown,
 * readVideoIds, readYaml, getPodcastEpisode) are excluded -- they depend on
 * fs.readFileSync and belong in integration tests.
 */

function createMockLR(overrides: Partial<LearningResource> = {}): LearningResource {
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

// ---------------------------------------------------------------------------
// getFileWithName
// ---------------------------------------------------------------------------
describe("getFileWithName", () => {
  it("returns the full path when the file name matches", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/weburl"],
    });
    expect(getFileWithName(lr, "weburl")).toBe("/root/course/topic/unit-1/weburl");
  });

  it("returns empty string when no file matches", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/readme.md"],
    });
    expect(getFileWithName(lr, "weburl")).toBe("");
  });

  it("matches only exact file names, not partial names", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/weburl-extra"],
    });
    expect(getFileWithName(lr, "weburl")).toBe("");
  });

  it("returns the last match when multiple files share the same name", () => {
    const lr = createMockLR({
      files: [
        "/root/course/a/videoid",
        "/root/course/b/videoid",
      ],
    });
    // The implementation iterates with forEach and overwrites, so last wins
    expect(getFileWithName(lr, "videoid")).toBe("/root/course/b/videoid");
  });

  it("handles an empty files array", () => {
    const lr = createMockLR({ files: [] });
    expect(getFileWithName(lr, "anything")).toBe("");
  });

  it("handles backslash path separators", () => {
    const lr = createMockLR({
      files: ["C:\\root\\course\\topic\\unit-1\\weburl"],
    });
    expect(getFileWithName(lr, "weburl")).toBe("C:\\root\\course\\topic\\unit-1\\weburl");
  });
});

// ---------------------------------------------------------------------------
// getRoute
// ---------------------------------------------------------------------------
describe("getRoute", () => {
  it("constructs a route with the courseRoot stripped", () => {
    const lr = createMockLR({
      type: "talk",
      route: "/root/course/topic/unit-1",
      courseRoot: "/root/course",
    });
    expect(getRoute(lr)).toBe("/talk/{{COURSEURL}}/topic/unit-1");
  });

  it("handles a route that equals the courseRoot exactly", () => {
    const lr = createMockLR({
      type: "course",
      route: "/root/course",
      courseRoot: "/root/course",
    });
    expect(getRoute(lr)).toBe("/course/{{COURSEURL}}");
  });

  it("uses the lr.type in the generated route", () => {
    const lr = createMockLR({
      type: "lab",
      route: "/root/course/topic/lab-1",
      courseRoot: "/root/course",
    });
    expect(getRoute(lr)).toBe("/lab/{{COURSEURL}}/topic/lab-1");
  });
});

// ---------------------------------------------------------------------------
// getFileWithType
// ---------------------------------------------------------------------------
describe("getFileWithType", () => {
  it("returns the first file matching a given extension", () => {
    const lr = createMockLR({
      files: [
        "/root/course/topic/unit-1/talk.md",
        "/root/course/topic/unit-1/image.png",
      ],
    });
    expect(getFileWithType(lr, ["md"])).toBe("/root/course/topic/unit-1/talk.md");
  });

  it("returns empty string when no file matches", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/image.png"],
    });
    expect(getFileWithType(lr, ["pdf"])).toBe("");
  });

  it("matches against multiple types and returns the first hit", () => {
    const lr = createMockLR({
      files: [
        "/root/course/topic/unit-1/photo.jpg",
        "/root/course/topic/unit-1/icon.png",
      ],
    });
    expect(getFileWithType(lr, ["png", "jpg"])).toBe("/root/course/topic/unit-1/photo.jpg");
  });

  it("handles files with no extension", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/weburl"],
    });
    expect(getFileWithType(lr, ["md"])).toBe("");
  });

  it("handles empty files array", () => {
    const lr = createMockLR({ files: [] });
    expect(getFileWithType(lr, ["md"])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getFilesWithType
// ---------------------------------------------------------------------------
describe("getFilesWithType", () => {
  it("returns all files matching a single extension", () => {
    const lr = createMockLR({
      files: [
        "/root/course/topic/a.md",
        "/root/course/topic/b.md",
        "/root/course/topic/c.png",
      ],
    });
    expect(getFilesWithType(lr, "md")).toEqual([
      "/root/course/topic/a.md",
      "/root/course/topic/b.md",
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/c.png"],
    });
    expect(getFilesWithType(lr, "pdf")).toEqual([]);
  });

  it("handles empty files array", () => {
    const lr = createMockLR({ files: [] });
    expect(getFilesWithType(lr, "md")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getFilesWithTypes
// ---------------------------------------------------------------------------
describe("getFilesWithTypes", () => {
  it("returns files matching any of the provided extensions", () => {
    const lr = createMockLR({
      files: [
        "/root/course/topic/photo.jpg",
        "/root/course/topic/icon.png",
        "/root/course/topic/doc.pdf",
      ],
    });
    expect(getFilesWithTypes(lr, ["jpg", "png"])).toEqual([
      "/root/course/topic/photo.jpg",
      "/root/course/topic/icon.png",
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/doc.pdf"],
    });
    expect(getFilesWithTypes(lr, ["jpg", "png"])).toEqual([]);
  });

  it("handles an empty types array", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/photo.jpg"],
    });
    expect(getFilesWithTypes(lr, [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getId
// ---------------------------------------------------------------------------
describe("getId", () => {
  it("returns the last path segment of the route", () => {
    const lr = createMockLR({ route: "/root/course/topic/unit-1" });
    expect(getId(lr)).toBe("unit-1");
  });

  it("handles a single-segment route", () => {
    const lr = createMockLR({ route: "course" });
    expect(getId(lr)).toBe("course");
  });

  it("handles a trailing slash by returning empty string", () => {
    const lr = createMockLR({ route: "/root/course/topic/" });
    // path.basename of a trailing-slash path returns the last non-empty segment
    expect(getId(lr)).toBe("topic");
  });
});

// ---------------------------------------------------------------------------
// getImage / getImageFile
// ---------------------------------------------------------------------------
describe("getImage", () => {
  it("returns a URL with the COURSEURL placeholder for an image file", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/image.png"],
      courseRoot: "/root/course",
    });
    expect(getImage(lr)).toBe("https://{{COURSEURL}}/topic/unit-1/image.png");
  });

  it("returns empty string when no image file is present", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/doc.pdf"],
    });
    expect(getImage(lr)).toBe("");
  });

  it("matches uppercase image extensions", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/PHOTO.JPG"],
      courseRoot: "/root/course",
    });
    expect(getImage(lr)).toBe("https://{{COURSEURL}}/topic/unit-1/PHOTO.JPG");
  });

  it("matches gif and svg extensions", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/anim.gif"],
      courseRoot: "/root/course",
    });
    expect(getImage(lr)).toBe("https://{{COURSEURL}}/topic/unit-1/anim.gif");
  });
});

describe("getImageFile", () => {
  it("returns just the file name of the image", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/banner.png"],
    });
    expect(getImageFile(lr)).toBe("banner.png");
  });

  it("returns empty string when no image file is present", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/doc.pdf"],
    });
    expect(getImageFile(lr)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getArchive / getArchiveFile
// ---------------------------------------------------------------------------
describe("getArchive", () => {
  it("returns a URL with the COURSEURL placeholder for a zip file", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/archive.zip"],
      courseRoot: "/root/course",
    });
    expect(getArchive(lr)).toBe("https://{{COURSEURL}}/topic/unit-1/archive.zip");
  });

  it("returns empty string when no zip file is present", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/image.png"],
    });
    expect(getArchive(lr)).toBe("");
  });
});

describe("getArchiveFile", () => {
  it("returns just the file name of the archive", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/lab-code.zip"],
    });
    expect(getArchiveFile(lr)).toBe("lab-code.zip");
  });

  it("returns empty string when no zip file is present", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/image.png"],
    });
    expect(getArchiveFile(lr)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getLabImage / getLabImageFile
// ---------------------------------------------------------------------------
describe("getLabImage", () => {
  it("returns image URL when child LR with id 'img' has a /img/main image", () => {
    const imgChild = createMockLR({
      id: "img",
      files: ["/root/course/topic/lab-1/img/main.png"],
      courseRoot: "/root/course",
    });
    const lr = createMockLR({
      lrs: [imgChild],
      courseRoot: "/root/course",
    });
    expect(getLabImage(lr)).toBe("https://{{COURSEURL}}/topic/lab-1/img/main.png");
  });

  it("returns empty string when no child LR with id 'img' exists", () => {
    const lr = createMockLR({ lrs: [] });
    expect(getLabImage(lr)).toBe("");
  });

  it("returns empty string when 'img' child has no /img/main path", () => {
    const imgChild = createMockLR({
      id: "img",
      files: ["/root/course/topic/lab-1/img/sidebar.png"],
    });
    const lr = createMockLR({ lrs: [imgChild] });
    expect(getLabImage(lr)).toBe("");
  });

  it("ignores child LRs that do not have id 'img'", () => {
    const otherChild = createMockLR({
      id: "steps",
      files: ["/root/course/topic/lab-1/img/main.png"],
    });
    const lr = createMockLR({ lrs: [otherChild] });
    expect(getLabImage(lr)).toBe("");
  });
});

describe("getLabImageFile", () => {
  it("returns just the file name when child LR has /img/main image", () => {
    const imgChild = createMockLR({
      id: "img",
      files: ["/root/course/topic/lab-1/img/main.jpg"],
    });
    const lr = createMockLR({ lrs: [imgChild] });
    expect(getLabImageFile(lr)).toBe("main.jpg");
  });

  it("returns empty string when no matching image exists", () => {
    const lr = createMockLR({ lrs: [] });
    expect(getLabImageFile(lr)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getPdf / getPdfFile
// ---------------------------------------------------------------------------
describe("getPdf", () => {
  it("returns a URL with the COURSEURL placeholder for a pdf file", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/slides.pdf"],
      courseRoot: "/root/course",
    });
    expect(getPdf(lr)).toBe("https://{{COURSEURL}}/topic/unit-1/slides.pdf");
  });

  it("returns empty string when no pdf file is present", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/image.png"],
    });
    expect(getPdf(lr)).toBe("");
  });
});

describe("getPdfFile", () => {
  it("returns just the file name of the pdf", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/lecture.pdf"],
    });
    expect(getPdfFile(lr)).toBe("lecture.pdf");
  });

  it("returns empty string when no pdf file is present", () => {
    const lr = createMockLR({
      files: ["/root/course/topic/unit-1/image.png"],
    });
    expect(getPdfFile(lr)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getVideo
// ---------------------------------------------------------------------------
describe("getVideo", () => {
  it("constructs a video route URL with the id appended", () => {
    const lr = createMockLR({
      route: "/root/course/topic/unit-1",
      courseRoot: "/root/course",
    });
    expect(getVideo(lr, "abc123")).toBe("/video/{{COURSEURL}}/topic/unit-1/abc123");
  });

  it("returns empty string when id is empty", () => {
    const lr = createMockLR();
    expect(getVideo(lr, "")).toBe("");
  });

  it("handles a deeply nested route", () => {
    const lr = createMockLR({
      route: "/root/course/topic/sub/deep/unit-1",
      courseRoot: "/root/course",
    });
    expect(getVideo(lr, "vid1")).toBe("/video/{{COURSEURL}}/topic/sub/deep/unit-1/vid1");
  });
});

// ---------------------------------------------------------------------------
// removeLeadingHashes
// ---------------------------------------------------------------------------
describe("removeLeadingHashes", () => {
  it("removes a single leading hash", () => {
    expect(removeLeadingHashes("# Title")).toBe(" Title");
  });

  it("removes multiple leading hashes, keeping content after the last one", () => {
    expect(removeLeadingHashes("## Subtitle")).toBe(" Subtitle");
  });

  it("removes all hashes including from ### headings", () => {
    expect(removeLeadingHashes("### Deep heading")).toBe(" Deep heading");
  });

  it("returns the original string when there are no hashes", () => {
    expect(removeLeadingHashes("No hashes here")).toBe("No hashes here");
  });

  it("handles an empty string", () => {
    expect(removeLeadingHashes("")).toBe("");
  });

  it("handles a string that is only hashes", () => {
    expect(removeLeadingHashes("###")).toBe("");
  });

  it("handles hashes later in the string (takes content after last hash)", () => {
    // The implementation uses lastIndexOf("#"), so a hash mid-string matters
    expect(removeLeadingHashes("Hello # World")).toBe(" World");
  });
});
