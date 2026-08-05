import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeFile, generateNetlifyToml } from "../../../packages/jsr/gen/src/utils/netlify.ts";

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "netlify-test-"));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("netlify: writeFile", () => {
  it("creates the folder when it does not exist", () => {
    const folder = path.join(testDir, "new-folder");

    writeFile(folder, "file.txt", "hello");

    expect(fs.existsSync(folder)).toBe(true);
  });

  it("does not fail when the folder already exists", () => {
    const folder = path.join(testDir, "existing-folder");
    fs.mkdirSync(folder);

    writeFile(folder, "file.txt", "hello");

    expect(fs.existsSync(folder)).toBe(true);
    expect(fs.readFileSync(path.join(folder, "file.txt"), "utf-8")).toBe("hello");
  });

  it("writes the file with the correct joined path", () => {
    const folder = path.join(testDir, "output");
    fs.mkdirSync(folder);

    writeFile(folder, "data.json", '{"key":"value"}');

    const written = fs.readFileSync(path.join(folder, "data.json"), "utf-8");
    expect(written).toBe('{"key":"value"}');
  });

  it("creates the folder then writes the file when folder is missing", () => {
    const folder = path.join(testDir, "brand-new");

    writeFile(folder, "index.html", "<html></html>");

    expect(fs.existsSync(folder)).toBe(true);
    const written = fs.readFileSync(path.join(folder, "index.html"), "utf-8");
    expect(written).toBe("<html></html>");
  });
});

describe("netlify: generateNetlifyToml", () => {
  let siteDir: string;

  beforeEach(() => {
    siteDir = path.join(testDir, "my-site");
  });

  it("writes a netlify.toml file to the site folder", () => {
    generateNetlifyToml(siteDir);

    expect(fs.existsSync(path.join(siteDir, "netlify.toml"))).toBe(true);
  });

  it("writes an index.html file to the site folder", () => {
    generateNetlifyToml(siteDir);

    expect(fs.existsSync(path.join(siteDir, "index.html"))).toBe(true);
  });

  it("netlify.toml contains a [[redirects]] block", () => {
    generateNetlifyToml(siteDir);

    const tomlContent = fs.readFileSync(path.join(siteDir, "netlify.toml"), "utf-8");
    expect(tomlContent).toContain("[[redirects]]");
  });

  it("netlify.toml redirect routes from /* to /index.html with status 200", () => {
    generateNetlifyToml(siteDir);

    const tomlContent = fs.readFileSync(path.join(siteDir, "netlify.toml"), "utf-8");
    expect(tomlContent).toContain('from = "/*"');
    expect(tomlContent).toContain('to = "/index.html"');
    expect(tomlContent).toContain("status = 200");
  });

  it("netlify.toml contains CORS Access-Control-Allow-Origin header set to *", () => {
    generateNetlifyToml(siteDir);

    const tomlContent = fs.readFileSync(path.join(siteDir, "netlify.toml"), "utf-8");
    expect(tomlContent).toContain('Access-Control-Allow-Origin = "*"');
  });

  it("netlify.toml contains [[headers]] block scoped to /*", () => {
    generateNetlifyToml(siteDir);

    const tomlContent = fs.readFileSync(path.join(siteDir, "netlify.toml"), "utf-8");
    expect(tomlContent).toContain("[[headers]]");
    expect(tomlContent).toContain('for = "/*"');
  });

  it("index.html contains a redirect script to tutors.dev/course/", () => {
    generateNetlifyToml(siteDir);

    const htmlContent = fs.readFileSync(path.join(siteDir, "index.html"), "utf-8");
    expect(htmlContent).toContain("https://tutors.dev/course/");
  });

  it("index.html uses window.location.host for the redirect", () => {
    generateNetlifyToml(siteDir);

    const htmlContent = fs.readFileSync(path.join(siteDir, "index.html"), "utf-8");
    expect(htmlContent).toContain("window.location.host");
  });

  it("index.html is a valid HTML document with DOCTYPE", () => {
    generateNetlifyToml(siteDir);

    const htmlContent = fs.readFileSync(path.join(siteDir, "index.html"), "utf-8");
    expect(htmlContent).toContain("<!DOCTYPE html>");
    expect(htmlContent).toContain("<html>");
    expect(htmlContent).toContain("</html>");
  });
});
