import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import {
  addTransport as addCoreTransport,
  clearGlobalContext,
  createLogger,
  getGlobalContext,
  removeTransport as removeCoreTransport,
  setGlobalContext,
  useCliOutput,
  type LogEntry,
} from "@tutors/logger-core";
import { addTransport, removeTransport } from "@tutors/logger";
import { readWholeFile } from "../../../../packages/jsr/gen/src/utils/file-utils.ts";
import { initCalendar } from "../../../../packages/jsr/model/src/utils/course-utils.ts";
import type { Course } from "@tutors/tutors-model-lib";
import { REPO_ROOT, toPosix } from "../../../../scripts/checks/lib/repo.ts";

const feature = await loadFeature("tests/bdd/features/developer/shared-logger.feature");

const PACKAGE_DIR = join(REPO_ROOT, "packages/jsr/logger-core");
const JSR_DIR = join(REPO_ROOT, "packages/jsr");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(PACKAGE_DIR, path), "utf8")) as Record<string, unknown>;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "test" ? [] : sourceFiles(join(dir, entry.name));
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [join(dir, entry.name)] : [];
  });
}

/** Every module specifier a file names: static imports, re-exports, `import type`, dynamic `import()` and `require()`. */
function importsOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require")) found.push(node.arguments[0].text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      found.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `console.<method>(...)` and `process.stderr.<anything>` in a file, as `line: text`. */
function bypassesOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)) {
      const text = node.expression.getText(source);
      if (text === "console" || text === "process.stderr") {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push(`${line + 1}: ${node.getText(source)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describeFeature(feature, ({ Rule }) => {
  Rule("Tutors shall keep its logger core package free of runtime dependencies, with every import inside the package's own files.", ({ RuleScenario }) => {
    RuleScenario("The logger core declares no dependencies", ({ Given, Then, And }) => {
      let node: Record<string, unknown> = {};
      let deno: Record<string, unknown> = {};
      Given("the manifests of the logger core package", () => {
        node = readJson("package.json");
        deno = readJson("deno.json");
        expect(node.name).toBe("@tutors/logger-core");
        expect(deno.name).toBe("@tutors/logger-core");
      });
      Then("its package.json declares no {string}", (_ctx: unknown, fields: string) => {
        for (const field of fields.split(",").map((f) => f.trim())) {
          expect(Object.keys((node[field] as object | undefined) ?? {}), `package.json ${field}`).toEqual([]);
        }
      });
      And("its deno.json declares no imports", () => {
        expect(Object.keys((deno.imports as object | undefined) ?? {})).toEqual([]);
      });
    });

    RuleScenario("The logger core imports only its own files", ({ Given, Then }) => {
      let files: string[] = [];
      Given("the source files of the logger core package", () => {
        files = sourceFiles(join(PACKAGE_DIR, "src"));
        expect(files.length).toBeGreaterThan(0);
      });
      Then("every import in them is a relative path to a file inside the package", () => {
        const outside = files.flatMap((file) =>
          importsOf(file)
            .filter((specifier) => !specifier.startsWith(".") || relative(PACKAGE_DIR, resolve(dirname(file), specifier)).startsWith(".."))
            .map((specifier) => `${relative(REPO_ROOT, file)} imports ${specifier}`)
        );
        expect(outside).toEqual([]);
      });
    });
  });

  Rule("When a Deno package reports an error or a warning, tutors shall pass it to every transport added through the logger core or the apps' logger.", ({ RuleScenario }) => {
    RuleScenario("A missing course file reaches a transport added through the apps' logger", ({ Given, When, Then }) => {
      const entries: LogEntry[] = [];
      const transport = (entry: LogEntry) => entries.push(entry);
      const missing = join(REPO_ROOT, "tests/bdd/no-such-dir/talk.md");
      Given("a transport added through the apps' logger", () => {
        addTransport(transport);
      });
      When("the generator reads a course file that does not exist", () => {
        const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
          expect(readWholeFile(missing)).toBe("");
        } finally {
          quiet.mockRestore();
          removeTransport(transport);
        }
      });
      Then("the transport receives a {string} entry {string} naming that path", (_ctx: unknown, level: string, message: string) => {
        expect(entries).toEqual([expect.objectContaining({ level, message, path: missing })]);
      });
    });

    RuleScenario("A malformed calendar reaches a transport added through the logger core", ({ Given, When, Then }) => {
      const entries: LogEntry[] = [];
      const transport = (entry: LogEntry) => entries.push(entry);
      Given("a transport added through the logger core", () => {
        addCoreTransport(transport);
      });
      When("the model library loads a course whose calendar has a week with no date", () => {
        const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
          const course = { courseId: "c1", los: [], calendar: { weeks: [{}] } } as unknown as Course;
          initCalendar(course, 0);
          expect(course.courseCalendar).toBeUndefined();
        } finally {
          quiet.mockRestore();
          removeCoreTransport(transport);
        }
      });
      Then("the transport receives an {string} entry {string}", (_ctx: unknown, level: string, message: string) => {
        expect(entries).toEqual([expect.objectContaining({ level, message, error: expect.any(String) })]);
      });
    });

    RuleScenario("No Deno package writes errors around the logger", ({ Given, Then }) => {
      let files: string[] = [];
      Given("the source files of the Deno packages outside the logger core", () => {
        files = sourceFiles(JSR_DIR).filter((file) => !toPosix(file).startsWith("packages/jsr/logger-core/"));
        expect(files.length).toBeGreaterThan(50); // the scan really walked the Deno packages
      });
      Then("none of them calls console or writes to process.stderr", () => {
        const bypasses = files.flatMap((file) => bypassesOf(file).map((hit) => `${toPosix(file)}:${hit}`));
        expect(bypasses).toEqual([]);
      });
    });
  });

  Rule("While a command-line tool has switched on CLI output, tutors shall print each log entry as one line of the tool's name, the level, the message, the error and the entry's values.", ({ RuleScenario }) => {
    let lines: string[] = [];
    // useCliOutput tags every entry with the tool's name; put the global context back afterwards.
    const saved = getGlobalContext();
    const warnWithPath = (message: string, path: string) => {
      const spy = vi.spyOn(console, "warn").mockImplementation((line: unknown) => {
        lines.push(String(line));
      });
      try {
        createLogger({ context: {} }).warn(message, { path });
      } finally {
        spy.mockRestore();
        useCliOutput(false);
        clearGlobalContext();
        setGlobalContext(saved);
      }
    };

    RuleScenario("The generator CLI prints a short line", ({ Given, When, Then }) => {
      Given("CLI output is switched on for {string}", (_ctx: unknown, app: string) => {
        lines = [];
        useCliOutput(app);
      });
      When("the logger warns {string} with path {string}", (_ctx: unknown, message: string, path: string) => {
        warnWithPath(message, path);
      });
      Then("the console line is {string}", (_ctx: unknown, expected: string) => {
        expect(lines).toEqual([expected]);
      });
    });

    RuleScenario("Without CLI output the line stays structured", ({ Given, When, Then }) => {
      Given("CLI output is switched off", () => {
        lines = [];
        useCliOutput(false);
      });
      When("the logger warns {string} with path {string}", (_ctx: unknown, message: string, path: string) => {
        warnWithPath(message, path);
      });
      Then("the console line is not {string}", (_ctx: unknown, cliLine: string) => {
        expect(lines).toHaveLength(1);
        expect(lines[0]).not.toBe(cliLine);
        expect(lines[0]).toContain("unable to locate file");
      });
    });
  });
});
