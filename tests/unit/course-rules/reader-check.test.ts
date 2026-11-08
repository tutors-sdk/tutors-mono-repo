import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { checkGeneratedFiles, checkZip, courseFromZip, findingsHeadline, UnreadableCourseError } from "../../../apps/reader/src/routes/(create)/create/check.ts";
import type { Finding } from "../../../packages/jsr/course-rules/src/mod.ts";

const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])));
const names = (files: Record<string, Uint8Array>) => Object.keys(files).sort();

describe("the reader's course check", () => {
  it("takes a single top folder as the course root, and keeps the root when files sit beside folders", () => {
    expect(names(courseFromZip(zip({ "web/course.md": "# W", "web/topic-01/topic.md": "# T" })))).toEqual(["course.md", "topic-01/topic.md"]);
    expect(names(courseFromZip(zip({ "course.md": "# W", "topic-01/topic.md": "# T" })))).toEqual(["course.md", "topic-01/topic.md"]);
    expect(names(courseFromZip(zip({ "a/course.md": "# W", "b/x.md": "" })))).toEqual(["a/course.md", "b/x.md"]);
    expect(names(courseFromZip(zip({ "course.md": "# W" })))).toEqual(["course.md"]);
  });

  it("drops folder entries, macOS resource forks and .DS_Store files before finding the root", () => {
    const files = courseFromZip(zip({ "web/": "", "web/course.md": "# W", "__MACOSX/web/._course.md": "x", "web/.DS_Store": "x", ".DS_Store": "x" }));
    expect(names(files)).toEqual(["course.md"]);
    expect(new TextDecoder().decode(files["course.md"])).toBe("# W");
  });

  it("refuses what is not a zip, and a zip with nothing in it, with a sentence for the instructor", () => {
    expect(() => courseFromZip(strToU8("not a zip"))).toThrow(new UnreadableCourseError("This file isn't a .zip that can be opened. Zip the course folder and try again."));
    expect(() => courseFromZip(zip({ "__MACOSX/x": "" }))).toThrow("This .zip is empty.");
    expect(new UnreadableCourseError("x")).toBeInstanceOf(Error);
  });

  it("checks a zip and generated files with the shared rules", async () => {
    expect((await checkZip(zip({ "web/topic-01/topic.md": "# T" }))).map((f) => f.rule)).toEqual(["V001", "V011", "V012"]);
    expect(
      await checkGeneratedFiles([
        { relativePath: "course.md", content: "# C\n" },
        { relativePath: "netlify.toml", content: '[build]\n  publish = "json"\n' }
      ])
    ).toEqual([]);
  });

  it("heads the list with counts, and an all-clear when only notes remain", () => {
    const f = (severity: Finding["severity"]): Finding => ({ rule: "V001", severity, path: "", message: "" });
    expect(findingsHeadline([])).toBe("No problems found.");
    expect(findingsHeadline([f("info")])).toBe("No problems found.");
    expect(findingsHeadline([f("warn")])).toBe("0 errors, 1 warning.");
    expect(findingsHeadline([f("error"), f("warn"), f("warn")])).toBe("1 error, 2 warnings. Fix the errors before publishing.");
    expect(findingsHeadline([f("error"), f("error")])).toBe("2 errors, 0 warnings. Fix the errors before publishing.");
  });
});
