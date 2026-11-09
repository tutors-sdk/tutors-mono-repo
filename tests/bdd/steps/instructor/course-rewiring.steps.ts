import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import yaml from "js-yaml";
import { expect } from "vitest";
import { validate, type FileOp } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { diskCourse } from "../../../../packages/jsr/create/src/course-fs.ts";
import { runRewire } from "../../../../packages/jsr/create/src/rewire-cli.ts";
import { runValidate } from "../../../../packages/jsr/create/src/validate-cli.ts";
import { parseCourse } from "../../../../packages/jsr/gen/src/tutors.ts";
import type { Lo } from "../../../../packages/jsr/model/src/tutors.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-rewiring.feature");

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  let dir: string;
  let out: string;
  let err: string;
  let status: number;
  const temps: string[] = [];

  AfterEachScenario(() => temps.splice(0).forEach((t) => rmSync(t, { recursive: true, force: true })));

  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const twoTopics = () => {
    const parent = mkdtempSync(join(tmpdir(), "tutors-rewire-"));
    temps.push(parent);
    dir = join(parent, "web-dev").replaceAll("\\", "/");
    put("course.md", "# Web Development\n");
    put("properties.yaml", "credits: Leigh\n");
    put("netlify.toml", '[build]\n  publish = "json"\n');
    put("topic-01/topic.md", "# Week 1\n");
    put("topic-02/topic.md", "# Week 2\n");
  };
  const talk = (topic: string, name: string) => {
    put(`${topic}/${name}/talk.md`, "# A talk\n");
    put(`${topic}/${name}/slides.pdf`, "%PDF");
  };
  const withTalks = (_ctx: unknown, first: string, second: string) => {
    twoTopics();
    talk("topic-01", first);
    talk("topic-01", second);
  };
  const talksIn = (topic: string) =>
    readdirSync(join(dir, topic))
      .filter((name) => name.startsWith("talk"))
      .sort();
  const holdsTalks = (topic: string) => (_ctx: unknown, first: string, second: string) => expect(talksIn(topic)).toEqual([first, second]);
  const rewire = async (_ctx: unknown, command: string) => {
    out = "";
    err = "";
    const words = command.split(" ").map((word) => (word === '""' ? "" : word));
    status = await runRewire([...words, "--course", dir], { out: (t) => (out += t), err: (t) => (err += t) });
  };
  const noErrors = async () => expect((await validate(diskCourse(dir))).filter((finding) => finding.severity === "error")).toEqual([]);
  const errorSays = (_ctx: unknown, text: string) => expect(err).toContain(text);
  const exit = (_ctx: unknown, code: number) => expect(status).toBe(code);
  const built = () => {
    const [course] = parseCourse(dir, true);
    const all: Lo[] = [];
    const visit = (lo: Lo) => {
      all.push(lo);
      for (const child of (lo as { los?: Lo[] }).los ?? []) visit(child);
    };
    visit(course as unknown as Lo);
    return all;
  };

  Rule("When an instructor runs tutors validate with --plan, tutors shall print the safe fixes as a JSON array of file operations and change nothing.", ({ RuleScenario }) => {
    RuleScenario("A capitalised talk folder", ({ Given, When, Then, And }) => {
      Given("a course of two topics whose first topic holds a folder {string}", (_ctx, name: string) => {
        twoTopics();
        talk("topic-01", name);
      });
      When("the instructor runs tutors validate on it with {string}", async (_ctx, flags: string) => {
        out = "";
        status = await runValidate([dir, flags], { out: (t) => (out += t), err: () => {} });
      });
      Then("the output shall parse as a JSON array holding a move from {string} to {string}", (_ctx, from: string, to: string) => {
        expect(JSON.parse(out) as FileOp[]).toContainEqual({ op: "move", from, to });
      });
      And("the folder {string} shall still be there", (_ctx, path: string) => expect(readdirSync(join(dir, dirname(path)))).toContain(path.slice(path.lastIndexOf("/") + 1)));
    });
  });

  Rule(
    "When an instructor reorders the items of one kind in a folder with tutors rewire, tutors shall renumber their folders in the new order and keep each folder's name after its number.",
    ({ RuleScenario }) => {
      RuleScenario("Two talks swapped", ({ Given, When, Then, And }) => {
        Given("a course of two topics whose first topic holds talks {string} and {string}", withTalks);
        When("the instructor runs tutors rewire {string}", rewire);
        Then("the first topic shall hold talks {string} and {string}", holdsTalks("topic-01"));
        And("validating the course shall find no errors", noErrors);
      });
    }
  );

  Rule(
    "If an instructor asks tutors rewire to reorder items of different kinds, then tutors shall change nothing and say that Tutors groups a folder's items by kind.",
    ({ RuleScenario }) => {
      RuleScenario("A talk put before a lab", ({ Given, When, Then, And }) => {
        Given("a course of two topics whose first topic holds talks {string} and {string}", withTalks);
        And("the first topic holds a lab {string}", (_ctx, name: string) => put(`topic-01/${name}/01.setup.md`, "# Setup\n"));
        When("the instructor runs tutors rewire {string}", rewire);
        Then("the error output shall include {string}", errorSays);
        And("the exit status shall be {int}", exit);
      });
    }
  );

  Rule("When an instructor moves an item into another topic with tutors rewire, tutors shall give it the next free number of its kind there.", ({ RuleScenario }) => {
    RuleScenario("A talk moved to the second week", ({ Given, When, Then, And }) => {
      Given("a course of two topics whose first topic holds talks {string} and {string}", withTalks);
      And("the second topic holds a talk {string}", (_ctx, name: string) => talk("topic-02", name));
      When("the instructor runs tutors rewire {string}", rewire);
      Then("the second topic shall hold talks {string} and {string}", holdsTalks("topic-02"));
      And("validating the course shall find no errors", noErrors);
    });
  });

  Rule(
    "If an instructor moves an item into a folder where Tutors does not show that kind, then tutors shall change nothing and say where that kind of item can go.",
    ({ RuleScenario }) => {
      RuleScenario("A topic moved into another topic", ({ Given, When, Then, And }) => {
        Given("a course of two topics", twoTopics);
        When("the instructor runs tutors rewire {string}", rewire);
        Then("the error output shall include {string}", errorSays);
        And("the exit status shall be {int}", exit);
      });
    }
  );

  Rule("When an instructor retitles an item with tutors rewire, tutors shall rewrite only the title line of the page Tutors takes the item's title from.", ({ RuleScenario }) => {
    RuleScenario("A talk with front matter and a body", ({ Given, When, Then }) => {
      Given(
        "a course of two topics whose first topic holds a talk {string} whose page has front matter, the title {string} and a paragraph",
        (_ctx, name: string, title: string) => {
          twoTopics();
          talk("topic-01", name);
          put(`topic-01/${name}/talk.md`, `---\nicon: mdi:web\n---\n\n# ${title}\n\nTags and elements.\n`);
        }
      );
      When("the instructor runs tutors rewire {string} with the title {string}", async (_ctx, command: string, title: string) => {
        out = "";
        err = "";
        status = await runRewire([...command.split(" "), title, "--course", dir], { out: (t) => (out += t), err: (t) => (err += t) });
      });
      Then("the talk's page shall keep its front matter and paragraph under the title {string}", (_ctx, heading: string) => {
        expect(readFileSync(join(dir, "topic-01/talk-01-html/talk.md"), "utf8")).toBe(`---\nicon: mdi:web\n---\n\n${heading}\n\nTags and elements.\n`);
      });
    });
  });

  Rule(
    "If an instructor asks tutors rewire to hide an item inside a topic, then tutors shall change nothing and say that Tutors hides only whole topics and units at the top of the course.",
    ({ RuleScenario }) => {
      RuleScenario("Hiding a talk", ({ Given, When, Then, And }) => {
        Given("a course of two topics whose first topic holds talks {string} and {string}", withTalks);
        When("the instructor runs tutors rewire {string}", rewire);
        Then("the error output shall include {string}", errorSays);
        And("the exit status shall be {int}", exit);
      });
      RuleScenario("Hiding a week", ({ Given, When, Then, And }) => {
        Given("a course of two topics", twoTopics);
        When("the instructor runs tutors rewire {string}", rewire);
        Then("properties.yaml shall list {string} under ignore", (_ctx, id: string) => {
          const properties = yaml.load(readFileSync(join(dir, "properties.yaml"), "utf8")) as { credits: string; ignore: string[] };
          expect(properties).toEqual({ credits: "Leigh", ignore: [id] });
        });
        And("the generator shall mark {string} hidden", (_ctx, id: string) => expect(built().find((lo) => lo.id === id)?.hide).toBe(true));
      });
    }
  );

  Rule(
    "When an instructor removes an item with tutors rewire, tutors shall move it into the course's .tutors-bin folder, which the generator never reads, and delete nothing.",
    ({ RuleScenario }) => {
      RuleScenario("A talk removed and put back", ({ Given, When, Then, And }) => {
        Given("a course of two topics whose first topic holds talks {string} and {string}", withTalks);
        When("the instructor runs tutors rewire {string}", rewire);
        Then("the folder {string} shall hold the talk's files", (_ctx, path: string) => expect(readdirSync(join(dir, path)).sort()).toEqual(["slides.pdf", "talk.md"]));
        And("the generator shall not show {string}", (_ctx, id: string) => {
          expect(built().some((lo) => lo.id === id)).toBe(false);
          expect(existsSync(join(dir, "topic-01", id))).toBe(false);
        });
        When("the instructor then runs tutors rewire {string}", rewire);
        Then("the first topic shall hold talks {string} and {string}", holdsTalks("topic-01"));
      });
    }
  );

  Rule("When an instructor runs tutors rewire with --plan, tutors shall print the plan as JSON and change nothing.", ({ RuleScenario }) => {
    RuleScenario("Planning a swap", ({ Given, When, Then, And }) => {
      Given("a course of two topics whose first topic holds talks {string} and {string}", withTalks);
      When("the instructor runs tutors rewire {string}", rewire);
      Then("the output shall parse as JSON with {int} operations", (_ctx, count: number) => expect((JSON.parse(out) as { ops: FileOp[] }).ops).toHaveLength(count));
      And("the first topic shall hold talks {string} and {string}", holdsTalks("topic-01"));
    });
  });
});
