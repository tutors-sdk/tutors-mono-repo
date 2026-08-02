import { describe, it, expect } from "vitest";

/**
 * Asset handling tests.
 *
 * The gen library constructs URLs and paths for course assets using
 * placeholder replacement ({{COURSEURL}}) and URL prefix patterns.
 * These tests validate those path-handling conventions using the same
 * logic exercised by injectCourseUrl in packages/jsr/model/src/utils/lo-utils.ts.
 */

function replacePlaceholder(template: string, courseId: string): string {
  return template.replace("{{COURSEURL}}", courseId);
}

function buildArchiveUrl(route: string, courseUrl: string, archiveFile: string): string {
  const cleanedRoute = route.replace("/archive/{{COURSEURL}}", courseUrl);
  return `https://${cleanedRoute}/${archiveFile}`;
}

function resolveImagePath(imgTemplate: string, courseUrl: string): string {
  return imgTemplate.replace("{{COURSEURL}}", courseUrl);
}

function resolvePdfPath(pdfTemplate: string, courseUrl: string): string {
  return pdfTemplate.replace("{{COURSEURL}}", courseUrl);
}

describe("asset-handling: route path placeholder replacement", () => {
  it("replaces {{COURSEURL}} in a route path with courseId", () => {
    const template = "/topic/{{COURSEURL}}/unit-1";
    const result = replacePlaceholder(template, "setu-hdip-2024");
    expect(result).toBe("/topic/setu-hdip-2024/unit-1");
  });

  it("returns the path unchanged when no placeholder is present", () => {
    const template = "/topic/unit-1";
    const result = replacePlaceholder(template, "setu-hdip-2024");
    expect(result).toBe("/topic/unit-1");
  });

  it("replaces only the first occurrence of the placeholder", () => {
    const template = "/{{COURSEURL}}/topic/{{COURSEURL}}";
    const result = replacePlaceholder(template, "my-course");
    expect(result).toBe("/my-course/topic/{{COURSEURL}}");
  });
});

describe("asset-handling: image path resolution", () => {
  it("resolves image path with course URL prefix", () => {
    const template = "{{COURSEURL}}/img/topic.png";
    const result = resolveImagePath(template, "https://raw.githubusercontent.com/user/repo/main");
    expect(result).toBe("https://raw.githubusercontent.com/user/repo/main/img/topic.png");
  });

  it("handles image path with no placeholder", () => {
    const template = "https://cdn.example.com/img/banner.png";
    const result = resolveImagePath(template, "https://example.com");
    expect(result).toBe("https://cdn.example.com/img/banner.png");
  });
});

describe("asset-handling: archive file URL construction", () => {
  it("builds full archive URL from route, courseUrl, and archiveFile", () => {
    const route = "/archive/{{COURSEURL}}";
    const courseUrl = "raw.githubusercontent.com/user/repo/main";
    const archiveFile = "project.zip";
    const result = buildArchiveUrl(route, courseUrl, archiveFile);
    expect(result).toBe("https://raw.githubusercontent.com/user/repo/main/project.zip");
  });

  it("handles archive files with nested paths", () => {
    const route = "/archive/{{COURSEURL}}";
    const courseUrl = "raw.githubusercontent.com/user/repo/main";
    const archiveFile = "labs/starter.zip";
    const result = buildArchiveUrl(route, courseUrl, archiveFile);
    expect(result).toBe("https://raw.githubusercontent.com/user/repo/main/labs/starter.zip");
  });
});

describe("asset-handling: PDF path resolution", () => {
  it("resolves PDF path with course URL", () => {
    const template = "{{COURSEURL}}/pdfs/lecture-01.pdf";
    const result = resolvePdfPath(template, "https://raw.githubusercontent.com/user/repo/main");
    expect(result).toBe("https://raw.githubusercontent.com/user/repo/main/pdfs/lecture-01.pdf");
  });

  it("handles PDF path with no placeholder", () => {
    const template = "https://cdn.example.com/pdfs/lecture.pdf";
    const result = resolvePdfPath(template, "https://example.com");
    expect(result).toBe("https://cdn.example.com/pdfs/lecture.pdf");
  });
});
