import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { zipSync } from "fflate";
import { expect } from "vitest";
import { outputsOf, platformDifferences } from "../../../../scripts/checks/platform-outputs.mjs";

const feature = await loadFeature("tests/bdd/features/developer/windows-generator.feature");

type Outputs = Record<string, Record<string, string>>;

describeFeature(feature, ({ Rule, AfterEachScenario }) => {
  let root = "";
  let built: Record<"linux" | "windows", Outputs> = { linux: {}, windows: {} };
  let findings: string[] = [];

  AfterEachScenario(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
    built = { linux: {}, windows: {} };
  });

  /** Writes a folder on "this platform" for real, so outputsOf reads the bytes as CI does. */
  const wrote = (platform: "linux" | "windows", folder: string, file?: string, text?: string | Buffer) => {
    root ||= mkdtempSync(join(tmpdir(), "platform-outputs-"));
    const dir = join(root, platform, folder);
    mkdirSync(dir, { recursive: true });
    if (file) writeFileSync(join(dir, file), text ?? "");
    built[platform][folder] = outputsOf(dir);
  };
  /** A zip as archiver writes one: the entry's time and the platform's attributes go into its bytes. */
  const zipped = (platform: "linux" | "windows") => (_ctx: unknown, folder: string, entry: string, os: string, year: string) => {
    const unix = os === "Unix";
    const bytes = zipSync(
      { [entry]: [new TextEncoder().encode("%PDF-1.7 talk"), { mtime: new Date(`${year}-03-01T10:00:00Z`), os: unix ? 3 : 0, attrs: unix ? 0o100644 << 16 : 0x20 }] },
      { level: 9 }
    );
    wrote(platform, folder, "pdfs.zip", Buffer.from(bytes));
  };
  const compare = () => {
    findings = platformDifferences(built.linux, built.windows, ["linux", "windows"]);
  };

  Rule(
    "If the generator or tutors-lite writes a file on Windows that differs from the file it writes on Linux for the same corpus course, then tutors shall fail the platform check and name each file that differs.",
    ({ RuleScenario }) => {
      RuleScenario("A file written with different bytes is named", ({ Given, And, When, Then }) => {
        Given("Linux wrote {string} with {string} holding {string}", (_ctx, folder: string, file: string, text: string) => wrote("linux", folder, file, text));
        And("Windows wrote {string} with {string} holding {string}", (_ctx, folder: string, file: string, text: string) => wrote("windows", folder, file, text));
        When("the platform outputs are compared", compare);
        Then("the comparison names {string}", (_ctx, finding: string) => expect(findings).toEqual([finding]));
      });
      RuleScenario("A file only one platform wrote is named", ({ Given, And, When, Then }) => {
        Given("Linux wrote {string} with {string} holding {string}", (_ctx, folder: string, file: string, text: string) => wrote("linux", folder, file, text));
        And("Windows wrote {string} with nothing", (_ctx, folder: string) => wrote("windows", folder));
        When("the platform outputs are compared", compare);
        Then("the comparison names {string}", (_ctx, finding: string) => expect(findings).toEqual([finding]));
      });
      RuleScenario("The same files on both platforms pass", ({ Given, And, When, Then }) => {
        Given("Linux wrote {string} with {string} holding {string}", (_ctx, folder: string, file: string, text: string) => wrote("linux", folder, file, text));
        And("Windows wrote {string} with {string} holding {string}", (_ctx, folder: string, file: string, text: string) => wrote("windows", folder, file, text));
        When("the platform outputs are compared", compare);
        Then("the comparison names nothing", () => expect(findings).toEqual([]));
      });
      RuleScenario("A zip is compared by the files it holds, not when or where it was zipped", ({ Given, And, When, Then }) => {
        Given("Linux wrote {string} with a zip holding {string} made on Unix in {int}", (ctx, folder: string, entry: string, year: number) =>
          zipped("linux")(ctx, folder, entry, "Unix", String(year))
        );
        And("Windows wrote {string} with a zip holding {string} made on Windows in {int}", (ctx, folder: string, entry: string, year: number) =>
          zipped("windows")(ctx, folder, entry, "Windows", String(year))
        );
        When("the platform outputs are compared", compare);
        Then("the comparison names nothing", () => expect(findings).toEqual([]));
      });
      RuleScenario("A zip holding a different file is named", ({ Given, And, When, Then }) => {
        Given("Linux wrote {string} with a zip holding {string} made on Unix in {int}", (ctx, folder: string, entry: string, year: number) =>
          zipped("linux")(ctx, folder, entry, "Unix", String(year))
        );
        And("Windows wrote {string} with a zip holding {string} made on Windows in {int}", (ctx, folder: string, entry: string, year: number) =>
          zipped("windows")(ctx, folder, entry, "Windows", String(year))
        );
        When("the platform outputs are compared", compare);
        Then("the comparison names {string}", (_ctx, finding: string) => expect(findings).toEqual([finding]));
      });
    }
  );
});
