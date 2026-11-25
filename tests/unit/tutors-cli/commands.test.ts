import { describe, expect, it } from "vitest";
import { commandFor, usage } from "../../../packages/jsr/tutors-cli/src/commands.ts";

// Plain assertions beside the Rule 0777 scenarios: a vitest-cucumber Then step is a test of its own, so the
// mutation run, which reruns only the tests covering a mutant, never reaches it.
describe("the tutors program's commands", () => {
  it("names each package's work and passes the later arguments on", () => {
    expect(commandFor(["build", "x"])).toEqual({ kind: "build" });
    expect(commandFor(["website", "x"])).toEqual({ kind: "website" });
    expect(commandFor(["validate", "courses/web", "--format", "json"])).toEqual({ kind: "validate", args: ["courses/web", "--format", "json"] });
    expect(commandFor(["import", "material", "--name", "Web"])).toEqual({ kind: "import", args: ["material", "--name", "Web"] });
    expect(commandFor(["create", "--pattern", "lecture-and-lab"])).toEqual({ kind: "create", args: ["--pattern", "lecture-and-lab"] });
  });

  it("reads every spelling of version and help", () => {
    for (const word of ["--version", "-V", "version"]) expect(commandFor([word])).toEqual({ kind: "version" });
    for (const args of [[], ["help"], ["--help"], ["-h"]]) expect(commandFor(args)).toEqual({ kind: "help" });
  });

  it("names an unknown command in the usage", () => {
    expect(commandFor(["bulid"])).toEqual({ kind: "help", unknown: "bulid" });
    expect(usage.startsWith("Usage: tutors <command>\n")).toBe(true);
    for (const name of ["build", "website", "validate", "import", "create", "--version"]) expect(usage).toMatch(new RegExp(`^  ${name} `, "m"));
  });
});
