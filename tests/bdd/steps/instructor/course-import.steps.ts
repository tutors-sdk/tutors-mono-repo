import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, expect } from "vitest";
import { proposeShape, validate, type ShapeProposal } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { diskCourse } from "../../../../packages/jsr/create/src/course-fs.ts";
import { runImport } from "../../../../packages/jsr/create/src/import-cli.ts";
import { importCase, type CorpusCase } from "../../../support/import-corpus.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-import.feature");

/** Stand-in contents for a corpus file written to disk: a title for markdown, the text for link files. */
const contentFor = (path: string, text?: string) => text ?? (path.endsWith(".md") ? `# ${path.slice(path.lastIndexOf("/") + 1, -3)}\n` : path.endsWith(".pdf") ? "%PDF" : "data");

const listing = (root: string, relative = ""): string[] =>
  readdirSync(join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
    return entry.isDirectory() ? listing(root, path) : [path];
  });

describeFeature(feature, ({ Rule }) => {
  let corpus: CorpusCase;
  let proposal: ShapeProposal;
  let source: string;
  let out: string;
  let output: string;
  let status: number;
  let before: string[];
  const temps: string[] = [];
  afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  const givenCase = (_ctx: unknown, name: string) => {
    corpus = importCase(name);
  };
  const givenOnDisk = (_ctx: unknown, name: string) => {
    corpus = importCase(name);
    const parent = mkdtempSync(join(tmpdir(), "tutors-import-"));
    temps.push(parent);
    source = join(parent, "material");
    out = join(parent, "courses");
    for (const file of corpus.files) {
      mkdirSync(dirname(join(source, file.path)), { recursive: true });
      writeFileSync(join(source, file.path), contentFor(file.path, file.text));
    }
    before = listing(source);
  };
  const propose = () => {
    proposal = proposeShape(corpus.files);
  };
  const matches = () => {
    const shape = proposal.topics.map((topic) => ({ week: topic.week, items: topic.items.map((item) => ({ kind: item.kind, files: item.files })) }));
    expect({ topics: shape, tray: proposal.tray }).toEqual(corpus.expected);
  };
  const runIt = async (_ctx: unknown, flags: string) => {
    const name = /--name (.+?)(?= --|$)/.exec(flags)![1];
    const rest = flags.replace(`--name ${name}`, "").trim().split(/\s+/).filter(Boolean);
    output = "";
    status = await runImport([source, "--name", name, "--out", out, ...rest], { out: (text) => (output += text), err: (text) => (output += text) });
  };
  const courseDir = () => join(out, "web-development");

  Rule(
    "When tutors is given a folder of material, tutors shall propose one topic per week named in a file or folder name, placing a .pdf as a Talk, a .md, .docx or .odt as a Note, a .zip as an Archive, a link file as a Web link and a folder of numbered .md files as one Lab.",
    ({ RuleScenario }) => {
      RuleScenario("Twelve weekly PDFs", ({ Given, When, Then }) => {
        Given("the import corpus folder {string}", givenCase);
        When("tutors proposes a shape for it", propose);
        Then("the proposal shall match the corpus", matches);
      });
      RuleScenario("A lecture's slides and its handout share a topic", ({ Given, When, Then, And }) => {
        Given("the import corpus folder {string}", givenCase);
        When("tutors proposes a shape for it", propose);
        Then("the proposal shall match the corpus", matches);
        And("week {int} shall hold a {string} and a {string}", (_ctx, week: number, first: string, second: string) => {
          expect(proposal.topics.find((topic) => topic.week === week)!.items.map((item) => item.kind)).toEqual([first, second]);
        });
      });
      RuleScenario("A Moodle-style export with a lab, starter code and a link", ({ Given, When, Then, And }) => {
        Given("the import corpus folder {string}", givenCase);
        When("tutors proposes a shape for it", propose);
        Then("the proposal shall match the corpus", matches);
        And("the {string} item of week {int} shall link to {string}", (_ctx, kind: string, week: number, url: string) => {
          expect(proposal.topics.find((topic) => topic.week === week)!.items.find((item) => item.kind === kind)!.url).toBe(url);
        });
      });
      RuleScenario("Leading numbers and short week names", ({ Given, When, Then }) => {
        Given("the import corpus folder {string}", givenCase);
        When("tutors proposes a shape for it", propose);
        Then("the proposal shall match the corpus", matches);
      });
      RuleScenario("Decks named only by date", ({ Given, When, Then }) => {
        Given("the import corpus folder {string}", givenCase);
        When("tutors proposes a shape for it", propose);
        Then("the proposal shall match the corpus", matches);
      });
    }
  );

  Rule("If a file's week or kind cannot be read from its name, then tutors shall put it in the tray for the instructor to place rather than guess.", ({ RuleScenario }) => {
    RuleScenario("Nothing names a week", ({ Given, When, Then, And }) => {
      Given("the import corpus folder {string}", givenCase);
      When("tutors proposes a shape for it", propose);
      Then("the proposal shall match the corpus", matches);
      And("the proposal shall have no topics", () => expect(proposal.topics).toEqual([]));
    });
    RuleScenario("A year in a name and a week number past 52", ({ Given, When, Then }) => {
      Given("the import corpus folder {string}", givenCase);
      When("tutors proposes a shape for it", propose);
      Then("the tray shall hold {string}", (_ctx, files: string) => expect(proposal.tray).toEqual(files.split("; ")));
    });
  });

  Rule(
    "When an instructor runs tutors import on a folder, tutors shall write the proposed course into a new folder with a topic for every week up to the last, copy each placed file into its item, leave the source folder unchanged, and list the files left in the tray.",
    ({ RuleScenario }) => {
      RuleScenario("Importing the Moodle-style export", ({ Given, When, Then, And }) => {
        Given("the import corpus folder {string} on disk", givenOnDisk);
        When("the instructor runs tutors import on it with {string}", runIt);
        Then("the exit status shall be {int}", (_ctx, code: number) => expect(status, output).toBe(code));
        And("the new course shall have no errors", async () => {
          expect((await validate(diskCourse(courseDir()))).filter((f) => f.severity === "error")).toEqual([]);
        });
        And("the new course shall hold {string}", (_ctx, files: string) => {
          for (const file of files.split("; ")) expect(existsSync(join(courseDir(), file)), file).toBe(true);
        });
        And("the output shall list {string} to place by hand", (_ctx, file: string) => {
          expect(output).toContain("Place these by hand");
          expect(output).toContain(`  ${file}\n`);
        });
        And("the source folder shall be unchanged", () => expect(listing(source)).toEqual(before));
      });
      RuleScenario("A folder where nothing names a week", ({ Given, When, Then, And }) => {
        Given("the import corpus folder {string} on disk", givenOnDisk);
        When("the instructor runs tutors import on it with {string}", runIt);
        Then("the exit status shall be {int}", (_ctx, code: number) => expect(status, output).toBe(code));
        And("no course folder shall have been written", () => expect(existsSync(courseDir())).toBe(false));
      });
    }
  );

  Rule(
    "Tutors shall take a file's week from the nearest file or folder whose name says week outright (Week 3, Wk3, w3) before a lecture number or a leading number in the file's own name.",
    ({ RuleScenario }) => {
      RuleScenario("Week folders whose files are numbered within the week", ({ Given, When, Then }) => {
        Given("the import corpus folder {string}", givenCase);
        When("tutors proposes a shape for it", propose);
        Then("the proposal shall match the corpus", matches);
      });
    }
  );
});
