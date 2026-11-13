import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { strToU8, zipSync } from "fflate";
import { flushSync, mount, tick, unmount } from "svelte";
import { expect } from "vitest";
import Findings from "../../../../packages/svelte/ui-components/src/validation/Findings.svelte";
import PreviewStep from "../../../../apps/reader/src/routes/(create)/create/PreviewStep.svelte";
import CheckPage from "../../../../apps/reader/src/routes/(create)/create/check/+page.svelte";
import { checkGeneratedFiles, checkZip } from "../../../../apps/reader/src/routes/(create)/create/check.ts";
import { validate, MemoryFileSystem, type Finding } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { defaultSpec, generateCourseFiles, type GeneratedFile } from "../../../../packages/jsr/create/src/generate.ts";
import { validateFixture, type FixtureForm } from "../../../support/validate-fixtures.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-check-reader.feature");

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Rule }) => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | undefined;
  let files: GeneratedFile[];
  let zip: Uint8Array;
  let fixture: Record<string, string>;
  let failure: unknown;

  BeforeEachScenario(() => {
    target = document.createElement("div");
    document.body.append(target);
    failure = undefined;
  });
  AfterEachScenario(() => {
    if (component) unmount(component);
    component = undefined;
    target.remove();
  });

  const show = (Component: typeof Findings | typeof PreviewStep | typeof CheckPage, props: Record<string, unknown>) => {
    component = mount(Component, { target, props });
    flushSync();
  };
  const wizardFiles = () => {
    files = generateCourseFiles({ ...defaultSpec, courseName: "Web Dev", courseId: "web-dev", includeSide: true, includeNotes: true, includeLabs: true, includeCalendar: true });
  };
  const preview = (findings: Finding[] | null) => show(PreviewStep, { files, courseId: "web-dev", findings, onnext: () => {}, onback: () => {} });
  const says = (_ctx: unknown, text: string) => expect(target.textContent).toContain(text);
  const checkIt = async () => {
    try {
      show(Findings, { findings: await checkZip(zip) });
      await tick();
    } catch (error) {
      failure = error;
    }
  };

  Rule("When the course wizard previews a course, the reader shall show what tutors validate finds in the files it is about to download.", ({ RuleScenario }) => {
    RuleScenario("A wizard course checks clean", ({ Given, When, Then }) => {
      Given("the wizard's files for a course with a side unit, notes, labs and a calendar", wizardFiles);
      When("the preview is shown", async () => preview(await checkGeneratedFiles(files)));
      Then("the preview shall say {string}", says);
    });
    RuleScenario("The preview while the check runs", ({ Given, When, Then }) => {
      Given("the wizard's files for a course with a side unit, notes, labs and a calendar", wizardFiles);
      When("the preview is shown before the check finishes", () => preview(null));
      Then("the preview shall say {string}", says);
    });
  });

  Rule(
    "When an instructor checks a course .zip in the reader, the reader shall list each finding with its severity, rule, path and message, as tutors validate reports it.",
    ({ RuleScenario }) => {
      RuleScenario("A zipped course folder with a misnamed week", ({ Given, When, Then, And }) => {
        Given("the {string} course of fixture {string} zipped inside the folder {string}", (_ctx, form: string, rule: string, folder: string) => {
          fixture = validateFixture(rule, form as FixtureForm);
          zip = zipSync(Object.fromEntries(Object.entries(fixture).map(([path, text]) => [`${folder}/${path}`, strToU8(text)])));
        });
        When("the instructor checks the zip", checkIt);
        Then("the list shall say {string}", says);
        And("the list shall show {string} with the message tutors validate gives", async (_ctx, text: string) => {
          const [severity, rule, ...path] = text.split(" ");
          const item = [...target.querySelectorAll(".finding")].find((li) => li.textContent?.includes(path.join(" ")))!;
          expect(item.textContent).toContain(severity);
          expect(item.textContent).toContain(rule);
          const expected = (await validate(new MemoryFileSystem(fixture))).find((f) => f.path === path.join(" "))!;
          expect(item.querySelector(".finding-message")!.textContent).toBe(expected.message);
        });
      });
      RuleScenario("A second zip chosen while the first is still being read", ({ Given, When, Then }) => {
        let release: () => void = () => {};
        const zipOf = (form: string, rule: string) =>
          zipSync(Object.fromEntries(Object.entries(validateFixture(rule, form as FixtureForm)).map(([path, text]) => [path, strToU8(text)])));
        const fileOf = (name: string, bytes: Uint8Array, gate: Promise<void>) => ({ name, arrayBuffer: async () => (await gate, bytes.slice().buffer) }) as unknown as File;
        let slow: File;
        let quick: File;
        const choose = (file: File) => {
          const input = target.querySelector<HTMLInputElement>("#course-zip")!;
          Object.defineProperty(input, "files", { value: [file], configurable: true });
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        Given(
          "the check page, with the {string} course of fixture {string} slow to read and the {string} course of fixture {string} quick",
          (_ctx, slowForm: string, slowRule: string, quickForm: string, quickRule: string) => {
            show(CheckPage, {});
            slow = fileOf(`${slowForm}.zip`, zipOf(slowForm, slowRule), new Promise((resolve) => (release = resolve)));
            quick = fileOf(`${quickForm}.zip`, zipOf(quickForm, quickRule), Promise.resolve());
          }
        );
        When("the instructor chooses the slow zip and then the quick one", async () => {
          choose(slow);
          choose(quick);
          await new Promise((resolve) => setTimeout(resolve, 0));
          release();
          await new Promise((resolve) => setTimeout(resolve, 0));
          await tick();
        });
        Then("the page shall name {string} and say {string}", (_ctx, name: string, text: string) => {
          expect(target.textContent).toContain(`Checked ${name}`);
          expect(target.textContent).toContain(text);
          expect(target.textContent).not.toContain("V002");
        });
      });
      RuleScenario("A course zipped from inside its folder", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string} zipped at the top level", (_ctx, form: string, rule: string) => {
          zip = zipSync(Object.fromEntries(Object.entries(validateFixture(rule, form as FixtureForm)).map(([path, text]) => [path, strToU8(text)])));
        });
        When("the instructor checks the zip", checkIt);
        Then("the list shall say {string}", says);
      });
    }
  );

  Rule("If the file an instructor checks is not a zip that holds anything, then the reader shall say what to do instead of listing findings.", ({ RuleScenario }) => {
    const sayInstead = (_ctx: unknown, text: string) => {
      expect((failure as Error).message).toBe(text);
      expect(target.querySelector(".finding")).toBeNull();
    };
    RuleScenario("A PDF chosen by mistake", ({ Given, When, Then }) => {
      Given("a file that is not a zip", () => {
        zip = strToU8("%PDF-1.7");
      });
      When("the instructor checks the zip", checkIt);
      Then("the reader shall say {string}", sayInstead);
    });
    RuleScenario("An empty zip", ({ Given, When, Then }) => {
      Given("a zip holding only a .DS_Store file", () => {
        zip = zipSync({ ".DS_Store": strToU8("x"), "web-dev/": new Uint8Array() });
      });
      When("the instructor checks the zip", checkIt);
      Then("the reader shall say {string}", sayInstead);
    });
  });
});
