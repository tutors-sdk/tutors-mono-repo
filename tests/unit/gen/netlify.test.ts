import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for packages/jsr/gen/src/utils/netlify.ts
 *
 * Both writeFile and generateNetlifyToml wrap Node's fs module.
 * We mock "node:fs" to verify correct calls without touching the filesystem.
 */

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import * as fs from "node:fs";
import { writeFile, generateNetlifyToml } from "../../../packages/jsr/gen/src/utils/netlify.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// writeFile
// ---------------------------------------------------------------------------
describe("netlify: writeFile", () => {
  it("creates the folder when it does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    writeFile("/site/output", "file.txt", "hello");

    expect(fs.mkdirSync).toHaveBeenCalledWith("/site/output");
  });

  it("does not create the folder when it already exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    writeFile("/site/output", "file.txt", "hello");

    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it("writes the file with the correct joined path", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    writeFile("/site/output", "data.json", '{"key":"value"}');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/site/output/data.json",
      '{"key":"value"}',
    );
  });

  it("creates the folder then writes the file when folder is missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    writeFile("/new/folder", "index.html", "<html></html>");

    expect(fs.mkdirSync).toHaveBeenCalledWith("/new/folder");
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/new/folder/index.html",
      "<html></html>",
    );
  });
});

// ---------------------------------------------------------------------------
// generateNetlifyToml
// ---------------------------------------------------------------------------
describe("netlify: generateNetlifyToml", () => {
  it("writes a netlify.toml file to the site folder", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    generateNetlifyToml("/deploy/my-site");

    const tomlCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (call) => (call[0] as string).endsWith("netlify.toml"),
    );
    expect(tomlCall).toBeDefined();
    expect(tomlCall![0]).toBe("/deploy/my-site/netlify.toml");
  });

  it("writes an index.html file to the site folder", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    generateNetlifyToml("/deploy/my-site");

    const htmlCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (call) => (call[0] as string).endsWith("index.html"),
    );
    expect(htmlCall).toBeDefined();
    expect(htmlCall![0]).toBe("/deploy/my-site/index.html");
  });

  it("netlify.toml contains a [[redirects]] block", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    generateNetlifyToml("/deploy/my-site");

    const tomlCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (call) => (call[0] as string).endsWith("netlify.toml"),
    );
    const tomlContent = tomlCall![1] as string;
    expect(tomlContent).toContain("[[redirects]]");
  });

  it("netlify.toml redirect routes from /* to /index.html with status 200", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    generateNetlifyToml("/deploy/my-site");

    const tomlCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (call) => (call[0] as string).endsWith("netlify.toml"),
    );
    const tomlContent = tomlCall![1] as string;
    expect(tomlContent).toContain('from = "/*"');
    expect(tomlContent).toContain('to = "/index.html"');
    expect(tomlContent).toContain("status = 200");
  });

  it("netlify.toml contains CORS Access-Control-Allow-Origin header set to *", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    generateNetlifyToml("/deploy/my-site");

    const tomlCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (call) => (call[0] as string).endsWith("netlify.toml"),
    );
    const tomlContent = tomlCall![1] as string;
    expect(tomlContent).toContain('Access-Control-Allow-Origin = "*"');
  });

  it("netlify.toml contains [[headers]] block scoped to /*", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    generateNetlifyToml("/deploy/my-site");

    const tomlCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (call) => (call[0] as string).endsWith("netlify.toml"),
    );
    const tomlContent = tomlCall![1] as string;
    expect(tomlContent).toContain("[[headers]]");
    expect(tomlContent).toContain('for = "/*"');
  });

  it("index.html contains a redirect script to tutors.dev/course/", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    generateNetlifyToml("/deploy/my-site");

    const htmlCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (call) => (call[0] as string).endsWith("index.html"),
    );
    const htmlContent = htmlCall![1] as string;
    expect(htmlContent).toContain("https://tutors.dev/course/");
  });

  it("index.html uses window.location.host for the redirect", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    generateNetlifyToml("/deploy/my-site");

    const htmlCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (call) => (call[0] as string).endsWith("index.html"),
    );
    const htmlContent = htmlCall![1] as string;
    expect(htmlContent).toContain("window.location.host");
  });

  it("index.html is a valid HTML document with DOCTYPE", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    generateNetlifyToml("/deploy/my-site");

    const htmlCall = vi.mocked(fs.writeFileSync).mock.calls.find(
      (call) => (call[0] as string).endsWith("index.html"),
    );
    const htmlContent = htmlCall![1] as string;
    expect(htmlContent).toContain("<!DOCTYPE html>");
    expect(htmlContent).toContain("<html>");
    expect(htmlContent).toContain("</html>");
  });
});
