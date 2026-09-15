import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { toSnakeCase, generateLlms } from "../../../packages/jsr/gen/src/utils/llms.ts";

describe("llms: toSnakeCase", () => {
  it("converts spaces to hyphens", () => {
    expect(toSnakeCase("hello world")).toBe("hello-world");
  });

  it("converts uppercase letters to lowercase", () => {
    expect(toSnakeCase("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(toSnakeCase("hello@world!")).toBe("helloworld");
  });

  it("preserves numbers", () => {
    expect(toSnakeCase("topic 42")).toBe("topic-42");
  });

  it("returns empty string for empty input", () => {
    expect(toSnakeCase("")).toBe("");
  });

  it("leaves already-kebab-case strings unchanged (hyphens are stripped as non-alphanumeric)", () => {
    // The regex [^a-z0-9\s] removes hyphens, so "hello-world" becomes "helloworld"
    expect(toSnakeCase("hello-world")).toBe("helloworld");
  });

  it("collapses multiple spaces into a single hyphen", () => {
    expect(toSnakeCase("hello   world")).toBe("hello-world");
  });

  it("handles mixed special characters and spaces", () => {
    // & is removed, surrounding spaces collapse via \s+ into a single hyphen
    expect(toSnakeCase("Web Dev & Design 101")).toBe("web-dev-design-101");
  });

  it("handles strings with only special characters", () => {
    expect(toSnakeCase("!@#$%")).toBe("");
  });

  it("handles strings with leading and trailing spaces", () => {
    expect(toSnakeCase("  hello  ")).toBe("-hello-");
  });
});

function makeCourse(overrides: Record<string, unknown> = {}): any {
  return {
    type: "course",
    title: "Test Course",
    contentMd: "# Test Course\nSome content",
    route: "/course/{{COURSEURL}}",
    los: [],
    properties: { credits: "Lecturer Name", llm: 0, ...(overrides.properties as Record<string, unknown>) },
    ...overrides,
  };
}

describe("llms: generateLlms", () => {
  let testDir: string;

  afterEach(async () => {
    // compressToZip is async and not awaited by generateLlms, so its
    // createWriteStream file-open may still be in flight when the test ends.
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("does not create llms directory when llm is 0", () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "llms-test-"));
    const course = makeCourse({ properties: { credits: "Author", llm: 0 } });
    generateLlms(course, testDir);
    expect(fs.existsSync(path.join(testDir, "llms"))).toBe(false);
  });

  it("does not create llms directory when llm is undefined", () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "llms-test-"));
    const course = makeCourse({ properties: { credits: "Author" } });
    generateLlms(course, testDir);
    expect(fs.existsSync(path.join(testDir, "llms"))).toBe(false);
  });

  it("creates llms output with expected content when llm is 1", async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "llms-test-"));

    const course = makeCourse({
      los: [
        {
          type: "topic",
          title: "Topic One",
          contentMd: "# Topic One\nTopic content",
          route: "/topic/{{COURSEURL}}/topic-one",
          hide: false,
          los: [
            {
              type: "note",
              title: "A Note",
              contentMd: "# A Note\nNote body text",
              route: "/note/{{COURSEURL}}/topic-one/a-note",
            },
          ],
        },
      ],
      properties: { credits: "Test Author", llm: 1 },
    });

    generateLlms(course, testDir);

    // compressToZip opens write streams asynchronously — wait for them to settle
    await new Promise((r) => setTimeout(r, 100));

    const llmFolder = path.join(testDir, "llms");
    expect(fs.existsSync(llmFolder)).toBe(true);

    const completeLlmsFile = path.join(llmFolder, "test-course-complete-llms.txt");
    expect(fs.existsSync(completeLlmsFile)).toBe(true);

    const content = fs.readFileSync(completeLlmsFile, "utf-8");
    expect(content).toContain("Test Course");
    expect(content).toContain("<SYSTEM>");
    expect(content).toContain("Test Author");
    expect(content).toContain("Topic One");
    expect(content).toContain("Note body text");

    const topicsFolder = path.join(llmFolder, "topics");
    const topicFile = path.join(topicsFolder, "00-topic-one-llms.txt");
    expect(fs.existsSync(topicFile)).toBe(true);

    const topicContent = fs.readFileSync(topicFile, "utf-8");
    expect(topicContent).toContain("Topic One");
    expect(topicContent).toContain("<SYSTEM>");
  });
});
