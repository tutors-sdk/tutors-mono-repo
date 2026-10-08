import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { LO_TYPES, SENTIMENTS } from "@tutors/tutors-types";
import { COURSE_SENTIMENT_IDS, loCompositeTypes, simpleTypes } from "@tutors/tutors-model-lib";
import { REPO_ROOT } from "../../../../scripts/checks/lib/repo.ts";

const feature = await loadFeature("tests/bdd/features/developer/shared-types.feature");

const PACKAGE_DIR = join(REPO_ROOT, "packages/jsr/types");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(PACKAGE_DIR, path), "utf8")) as Record<string, unknown>;
}

function sourceFiles(dir: string = join(PACKAGE_DIR, "src")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : []
  );
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

describeFeature(feature, ({ Rule }) => {
  Rule("Tutors shall keep its shared types package free of runtime dependencies, with every import inside the package's own files.", ({ RuleScenario }) => {
    RuleScenario("The shared types package declares no dependencies", ({ Given, Then, And }) => {
      let node: Record<string, unknown> = {};
      let deno: Record<string, unknown> = {};
      Given("the manifests of the shared types package", () => {
        node = readJson("package.json");
        deno = readJson("deno.json");
        expect(node.name).toBe("@tutors/tutors-types");
        expect(deno.name).toBe("@tutors/tutors-types");
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

    RuleScenario("The shared types package imports only its own files", ({ Given, Then }) => {
      let files: string[] = [];
      Given("the source files of the shared types package", () => {
        files = sourceFiles();
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

  Rule("Tutors shall list the same learning-object kinds and sentiments in its shared types package as in tutors-model-lib.", ({ RuleScenario }) => {
    RuleScenario("Learning-object kinds match tutors-model-lib", ({ Given, Then }) => {
      let kinds: string[] = [];
      Given("the learning-object kinds of the shared types package", () => {
        kinds = [...LO_TYPES];
      });
      Then("they are model-lib's simple kinds followed by its composite kinds", () => {
        expect(kinds).toEqual([...simpleTypes, ...loCompositeTypes]);
      });
    });

    RuleScenario("Sentiments match tutors-model-lib", ({ Given, Then }) => {
      let sentiments: string[] = [];
      Given("the sentiments of the shared types package", () => {
        sentiments = [...SENTIMENTS];
      });
      Then("they are model-lib's course sentiments in the same order", () => {
        expect(sentiments).toEqual([...COURSE_SENTIMENT_IDS]);
      });
    });
  });
});
