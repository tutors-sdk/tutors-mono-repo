import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { esmGlobalFindings, parseEnvFile, scanServerBundle, statusFindings } from "../../scripts/checks/server-smoke.ts";
import { loadHeaderContract } from "../../scripts/checks/security.ts";

describe("built-server smoke (runway tier J, no Docker)", () => {
  describe("esm-global scan", () => {
    it("flags a chunk that reads __dirname or __filename with no declaration", () => {
      // The shape jsdom had in the v16.2.0 reader bundle.
      const jsdom = 'const path = require$1("path"); const sheet = readFileSync(path.resolve(__dirname, "./default-stylesheet.css"));';
      expect(esmGlobalFindings("reader: chunks/jsdom.js", jsdom)).toEqual([
        "esm-global: reader: chunks/jsdom.js: __dirname is not defined in ES module scope"
      ]);
      expect(esmGlobalFindings("reader: chunks/a.js", "const here = __filename;")).toHaveLength(1);
      // A typeof guard on one use does not excuse an unguarded one.
      expect(esmGlobalFindings("f", 'if (typeof __dirname !== "undefined") use(__dirname);')).toHaveLength(1);
    });

    it("accepts a chunk that guards, declares or merely names the globals", () => {
      expect(esmGlobalFindings("f", 'const ok = typeof __dirname === "undefined";')).toEqual([]);
      expect(esmGlobalFindings("f", "const __dirname = dirname(fileURLToPath(import.meta.url)); read(__dirname);")).toEqual([]);
      expect(esmGlobalFindings("f", "const x = obj.__dirname; const my__dirname2 = 1;")).toEqual([]);
      expect(esmGlobalFindings("f", "export const answer = 42;")).toEqual([]);
    });
  });

  describe("scanServerBundle", () => {
    let serverDir: string;

    beforeAll(() => {
      serverDir = mkdtempSync(join(tmpdir(), "tutors-server-"));
      const files: Record<string, string> = {
        "index.js": "export const ok = 1;",
        "chunks/clean.js": "export const clean = 2;",
        "chunks/SigninWithGithub-x.js": "export const css = readFileSync(join(__dirname, 'a.css'));",
        "nodes/1.js": "export const n = 1;"
      };
      for (const [path, contents] of Object.entries(files)) {
        mkdirSync(dirname(join(serverDir, path)), { recursive: true });
        writeFileSync(join(serverDir, path), contents);
      }
    });

    afterAll(() => rmSync(serverDir, { recursive: true, force: true }));

    it("names the offending chunk and only that chunk", () => {
      expect(scanServerBundle("reader", serverDir)).toEqual([
        "esm-global: reader: chunks/SigninWithGithub-x.js: __dirname is not defined in ES module scope"
      ]);
    });
  });

  it("turns 5xx answers into findings and leaves 2xx to 4xx alone", () => {
    expect(
      statusFindings("reader", [
        { path: "/", status: 200 },
        { path: "/runway-smoke-not-found", status: 404 },
        { path: "/auth/runway-smoke-course", status: 500 },
        { path: "/auth", status: 503 }
      ])
    ).toEqual(["http-5xx: reader: GET /auth/runway-smoke-course answered 500", "http-5xx: reader: GET /auth answered 503"]);
  });

  it("reads placeholder values from a dotenv file and drops blanks and comments", () => {
    expect(parseEnvFile("# comment\nPUBLIC_ANON_MODE=TRUE\nLOG_LEVEL=\n\nPRIVATE_AUTH_SECRET = abc def \n")).toEqual({
      PUBLIC_ANON_MODE: "TRUE",
      PRIVATE_AUTH_SECRET: "abc def"
    });
  });

  it("the reader probes the sign-in routes that answered 500 on v16.2.0", () => {
    const paths = loadHeaderContract().apps.reader.paths;
    expect(paths).toEqual(expect.arrayContaining(["/auth", "/auth/runway-smoke-course"]));
  });
});
