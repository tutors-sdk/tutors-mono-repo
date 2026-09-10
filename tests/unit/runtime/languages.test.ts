import { describe, it, expect } from "vitest";
import { languageForPath, runtimeFileExtension, runtimeLabel } from "../../../packages/svelte/utils/runtime/src/languages.ts";

/** The small mappings the editor, the tabs and the run-time badge all read from. */

describe("runtimeLabel", () => {
  it("names each runtime the way its community writes it", () => {
    expect(runtimeLabel("python")).toBe("Python");
    expect(runtimeLabel("javascript")).toBe("JavaScript");
    expect(runtimeLabel("typescript")).toBe("TypeScript");
  });
});

describe("runtimeFileExtension", () => {
  it("suggests the extension a new file in this playground should have", () => {
    expect(runtimeFileExtension("python")).toBe("py");
    expect(runtimeFileExtension("javascript")).toBe("js");
    expect(runtimeFileExtension("typescript")).toBe("ts");
  });
});

describe("languageForPath", () => {
  it("highlights a file by its own extension, not the kernel's language", () => {
    expect(languageForPath("helper.js", "python")).toBe("javascript");
    expect(languageForPath("types.ts", "python")).toBe("typescript");
    expect(languageForPath("script.py", "typescript")).toBe("python");
  });

  it("treats data files as data rather than as code", () => {
    expect(languageForPath("data.json", "python")).toBe("json");
    expect(languageForPath("notes.txt", "python")).toBe("text");
    expect(languageForPath("rows.csv", "python")).toBe("text");
  });

  it("is not fooled by capitals or by a name with several dots", () => {
    expect(languageForPath("Main.PY", "javascript")).toBe("python");
    expect(languageForPath("my.helper.module.ts", "python")).toBe("typescript");
  });

  it("falls back to the playground's runtime for a name it does not recognise", () => {
    expect(languageForPath("Makefile", "python")).toBe("python");
    expect(languageForPath("data.parquet", "typescript")).toBe("typescript");
  });
});
