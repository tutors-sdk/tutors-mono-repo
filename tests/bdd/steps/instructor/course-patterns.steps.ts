import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import yaml from "js-yaml";
import { expect } from "vitest";
import { MemoryFileSystem, validate } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { defaultSpec, generateCourseFiles, type CourseSpec } from "../../../../packages/jsr/create/src/generate.ts";
import { runPatternCreate } from "../../../../packages/jsr/create/src/pattern-cli.ts";
import { parseCourse } from "../../../../packages/jsr/gen/src/tutors.ts";
import type { Lo } from "../../../../packages/jsr/model/src/tutors.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-patterns.feature");

type Week = { date: string; week?: number; topic: string };

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  let spec: CourseSpec;
  let files: Record<string, string>;
  let out: string;
  let err: string;
  const temps: string[] = [];
  AfterEachScenario(() => temps.splice(0).forEach((t) => rmSync(t, { recursive: true, force: true })));

  const choose = (id: string, weeks: number, start: string, readingWeek?: number) => {
    spec = { ...defaultSpec, courseName: "Web Dev", courseId: "web-dev", pattern: { id, weeks, start, ...(readingWeek ? { readingWeek } : {}) } };
  };
  const generate = () => {
    files = Object.fromEntries(generateCourseFiles(spec).map((f) => [f.relativePath, f.content]));
  };
  const foldersUnder = (prefix: string) =>
    [
      ...new Set(
        Object.keys(files)
          .filter((p) => p.startsWith(`${prefix}/`))
          .map((p) => p.slice(prefix.length + 1).split("/")[0])
          .filter((name) => !name.includes("."))
      )
    ].sort();
  const topics = () => Object.keys(files).filter((p) => /^unit-\d+\/topic-\d+\/topic\.md$/.test(p));
  const units = () => new Set(Object.keys(files).filter((p) => /^unit-\d+\/unit\.md$/.test(p)));
  const calendar = () => (yaml.load(files["calendar.yaml"], { schema: yaml.JSON_SCHEMA }) as { weeks: Week[] }).weeks;

  Rule(
    "When an instructor creates a course from a pattern, tutors shall generate one topic per teaching week, grouped four weeks to a unit, each holding the learning objects the pattern names.",
    ({ RuleScenario }) => {
      RuleScenario("Twelve weeks of lecture and lab", ({ Given, When, Then, And }) => {
        Given("the pattern {string} for {int} weeks from {string}", (_ctx, id: string, weeks: number, start: string) => choose(id, weeks, start));
        When("the course is generated", generate);
        Then("it shall have {int} topics in {int} units", (_ctx, t: number, u: number) => {
          expect(topics()).toHaveLength(t);
          expect(units().size).toBe(u);
        });
        And("topic {string} shall hold {string}", (_ctx, topic: string, list: string) => expect(foldersUnder(topic)).toEqual(list.split(", ")));
        And("the side unit shall hold {string}", (_ctx, list: string) => expect(foldersUnder("side")).toEqual(list.split(", ")));
      });
      RuleScenario("Flipped weeks hold pre-reading, a lecture and a lab", ({ Given, When, Then, And }) => {
        Given("the pattern {string} for {int} weeks from {string}", (_ctx, id: string, weeks: number, start: string) => choose(id, weeks, start));
        When("the course is generated", generate);
        Then("it shall have {int} topics in {int} units", (_ctx, t: number, u: number) => {
          expect(topics()).toHaveLength(t);
          expect(units().size).toBe(u);
        });
        And("topic {string} shall hold {string}", (_ctx, topic: string, list: string) => expect(foldersUnder(topic)).toEqual(list.split(", ")));
      });
    }
  );

  Rule(
    "When an instructor creates a course from a pattern with a start date, tutors shall write a calendar.yaml dating each teaching week a week apart from the start, with the reading week as an undated-topic break.",
    ({ RuleScenario }) => {
      RuleScenario("A reading week after week 6 pushes the second half back", ({ Given, When, Then, And }) => {
        Given("the pattern {string} for {int} weeks from {string} with a reading week after week {int}", (_ctx, id: string, weeks: number, start: string, reading: number) =>
          choose(id, weeks, start, reading)
        );
        When("the course is generated", generate);
        Then("the calendar shall date week 1 {string}, week 6 {string} and week 7 {string}", (_ctx, w1: string, w6: string, w7: string) => {
          const byWeek = new Map(
            calendar()
              .filter((w) => w.week)
              .map((w) => [w.week, String(w.date)])
          );
          expect([byWeek.get(1), byWeek.get(6), byWeek.get(7)]).toEqual([w1, w6, w7]);
          expect(byWeek.size).toBe(12);
        });
        And("the calendar shall hold a {string} dated {string}", (_ctx, topic: string, date: string) => {
          const breaks = calendar().filter((w) => w.week === undefined);
          expect(breaks.map((w) => [w.topic, String(w.date)])).toEqual([[topic, date]]);
        });
      });
    }
  );

  Rule("Tutors shall generate every pattern's course so that tutors validate reports no findings on it.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("Each pattern validates clean", ({ Given, When, Then, And }, variables) => {
      Given("the pattern {string} for {int} weeks from {string} with a reading week after week {int}", (_ctx, _id: string, weeks: number, start: string, reading: number) =>
        choose(variables.pattern, weeks, start, reading)
      );
      When("the course is generated", generate);
      Then("tutors validate shall report no findings", async () => expect(await validate(new MemoryFileSystem(files))).toEqual([]));
      And("gen shall build a learning object for every generated folder", () => {
        const root = join(mkdtempSync(join(tmpdir(), "tutors-pattern-")), "course");
        temps.push(dirname(root));
        for (const [path, content] of Object.entries(files)) {
          mkdirSync(dirname(join(root, path)), { recursive: true });
          writeFileSync(join(root, path), content);
        }
        const [course] = parseCourse(root, true);
        const built = new Set<string>();
        const walk = (lo: Lo, prefix: string) =>
          ((lo as { los?: Lo[] }).los ?? []).forEach((child) => {
            if (child.type === "step") return;
            built.add(`${prefix}${child.id}`);
            walk(child, `${prefix}${child.id}/`);
          });
        walk(course, "");
        const folders = new Set(
          Object.keys(files).flatMap((p) =>
            p
              .split("/")
              .slice(0, -1)
              .map((_, i, parts) => parts.slice(0, i + 1).join("/"))
          )
        );
        expect([...folders].sort()).toEqual([...built].sort());
      });
    });
  });

  Rule("If an instructor names a pattern that does not exist, then tutors shall list the four patterns and create nothing.", ({ RuleScenario }) => {
    let dir: string;
    RuleScenario("A misspelt pattern", ({ Given, When, Then, And }) => {
      Given("an empty output folder for the course creator", () => {
        dir = mkdtempSync(join(tmpdir(), "tutors-pattern-cli-"));
        temps.push(dir);
      });
      When("the instructor runs the course creator with {string}", (_ctx, args: string) => {
        out = "";
        err = "";
        runPatternCreate([...args.split(" "), "--out", dir], { out: (t) => (out += t), err: (t) => (err += t) });
      });
      Then("the creator shall list the patterns {string}", (_ctx, list: string) => {
        for (const id of list.split(", ")) expect(err).toContain(`  ${id}`);
        expect(err).toMatch(/^Unknown pattern "lab-lecture"/);
      });
      And("the output folder shall still be empty", () => expect(readdirSync(dir)).toEqual([]));
    });
  });

  Rule(
    "When an instructor shapes the teaching week themselves, tutors shall generate each weekly topic holding exactly the lectures, labs and readings they named, numbered per kind, and the pattern's side unit.",
    ({ RuleScenario }) => {
      RuleScenario("Two lectures, a lab and a reading every week", ({ Given, When, Then, And }) => {
        Given("the pattern {string} for {int} weeks from {string} with weeks of {string}", (_ctx, id: string, weeks: number, start: string, kinds: string) => {
          choose(id, weeks, start);
          const week = kinds.split(", ").map((kind, i) => ({ kind: kind as "talk" | "lab" | "note", title: `Week {n} ${kind} ${i + 1}` }));
          spec = { ...spec, pattern: { ...spec.pattern!, week } };
        });
        When("the course is generated", generate);
        Then("topic {string} shall hold exactly {string}", (_ctx, topic: string, list: string) => expect(foldersUnder(topic)).toEqual(list.split(", ")));
        And("tutors validate shall report no findings on the shaped course", async () => expect(await validate(new MemoryFileSystem(files))).toEqual([]));
      });
    }
  );
});
