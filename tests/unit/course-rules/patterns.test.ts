import { mkdtempSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateCourseFiles, patternById, patterns } from "../../../packages/jsr/create/src/generate.ts";
import { patternCalendarYaml, patternFiles, teachingWeeks } from "../../../packages/jsr/create/src/pattern-course.ts";
import { parsePatternArgs, patternList, patternUsage, runPatternCreate } from "../../../packages/jsr/create/src/pattern-cli.ts";
import { defaultSpec, type CourseSpec } from "../../../packages/jsr/create/src/types.ts";

const spec = (id = "lecture-lab", weeks = 5, readingWeek?: number): CourseSpec => ({
  ...defaultSpec,
  courseName: "Web",
  courseId: "web",
  pattern: { id, weeks, start: "2027-01-25", ...(readingWeek ? { readingWeek } : {}) }
});
const paths = (s: CourseSpec) => generateCourseFiles(s).map((f) => f.relativePath);

describe("patterns", () => {
  it("are the four in the spec, each findable by id", () => {
    expect(patterns.map((p) => p.id)).toEqual(["lecture-lab", "lecture-only", "project-based", "flipped"]);
    expect(patternById("flipped")!.week.map((i) => i.kind)).toEqual(["note", "talk", "lab"]);
    expect(patternById("nope")).toBeUndefined();
  });

  it("dates weeks a week apart in UTC and slots the reading week after the week named", () => {
    expect(teachingWeeks({ id: "x", weeks: 3, start: "2027-03-22" })).toEqual({
      weeks: [
        { week: 1, date: "2027-03-22" },
        { week: 2, date: "2027-03-29" },
        { week: 3, date: "2027-04-05" }
      ],
      readingWeekDate: null
    });
    expect(teachingWeeks({ id: "x", weeks: 2, start: "2027-12-27", readingWeek: 1 })).toEqual({
      weeks: [
        { week: 1, date: "2027-12-27" },
        { week: 2, date: "2028-01-10" }
      ],
      readingWeekDate: "2028-01-03"
    });
  });

  it("refuses a start that is not a real YYYY-MM-DD date", () => {
    expect(() => teachingWeeks({ id: "x", weeks: 1, start: "25/01/2027" })).toThrow('"25/01/2027" is not a date like 2027-01-25');
    expect(() => teachingWeeks({ id: "x", weeks: 1, start: "2027-02-30" })).toThrow('"2027-02-30" is not a real date');
    expect(() => patternFiles(spec(), { id: "nope", weeks: 1, start: "2027-01-25" })).toThrow('Unknown pattern "nope"');
  });

  it("writes the calendar title, year and one entry per week", () => {
    expect(patternCalendarYaml(spec(), { id: "x", weeks: 2, start: "2027-01-25", readingWeek: 1 })).toBe(
      "title: Web Calendar\nyear: 2027\nweeks:\n  - date: 2027-01-25\n    week: 1\n    topic: Week 1\n  - date: 2027-02-01\n    topic: Reading Week\n  - date: 2027-02-08\n    week: 2\n    topic: Week 2\n"
    );
  });

  it("groups weeks four to a unit, naming a unit of one week in the singular", () => {
    const files = generateCourseFiles(spec("lecture-only", 5));
    const unitMd = (n: number) => files.find((f) => f.relativePath === `unit-${n}/unit.md`)!.content;
    expect(unitMd(1)).toBe("Weeks 1–4\n\nLecture only, weeks 1–4.\n");
    expect(unitMd(2)).toBe("Week 5\n\nLecture only, week 5.\n");
    expect(files.find((f) => f.relativePath === "unit-2/topic-05/topic.md")!.content).toContain("# Week 5\n\nWeek of 22 February 2027.");
  });

  it("always writes the root files, never the twelve-prompt options, and numbers repeated kinds", () => {
    const all = paths({ ...spec("project-based", 1), includeReadme: true, includeEnrollment: true });
    expect(all.slice(0, 5)).toEqual(["course.md", "properties.yaml", "netlify.toml", ".gitignore", "calendar.yaml"]);
    expect(all).not.toContain("README.md");
    expect(all).not.toContain("enrollment.yaml");
    expect(all).toContain("side/archive-01/archive.md");
    expect(all).toContain("unit-1/topic-01/lab-01/05.Step-05.md");
    const handbook = generateCourseFiles(spec("lecture-lab", 1)).find((f) => f.relativePath === "side/note-01/note.md")!.content;
    expect(handbook).toContain("# Module handbook");
  });
});

describe("tutors-create --pattern", () => {
  const ok = ["--pattern", "lecture-lab", "--name", "Web Dev", "--start", "2027-01-25"];

  it("reads the options, with 12 weeks and no reading week by default", () => {
    const parsed = parsePatternArgs([...ok, "--lecturer=Dr Ada", "--out", "courses"]);
    expect(parsed).toMatchObject({
      outputDir: "courses",
      spec: { courseName: "Web Dev", courseId: "web-dev", lecturerName: "Dr Ada", pattern: { id: "lecture-lab", weeks: 12, start: "2027-01-25" } }
    });
    expect(parsePatternArgs([...ok, "--weeks", "10", "--reading-week", "5"])).toMatchObject({ outputDir: ".", spec: { pattern: { weeks: 10, readingWeek: 5 } } });
    expect("readingWeek" in (parsePatternArgs(ok) as { spec: CourseSpec }).spec.pattern!).toBe(false);
  });

  it("names each wrong argument", () => {
    expect(parsePatternArgs(["web"])).toBe(`Unexpected "web". ${patternUsage}`);
    expect(parsePatternArgs([...ok, "--weeks"])).toBe(`--weeks needs a value. ${patternUsage}`);
    expect(parsePatternArgs([...ok, "--colour", "red"])).toBe(`Unknown option "--colour". ${patternUsage}`);
    expect(parsePatternArgs(["--name", "W", "--start", "2027-01-25"])).toBe(`Unknown pattern "". ${patternList()}`);
    expect(parsePatternArgs(["--pattern", "flipped", "--start", "2027-01-25"])).toBe(`Give the course a name with --name. ${patternUsage}`);
    expect(parsePatternArgs(["--pattern", "flipped", "--name", "!!", "--start", "2027-01-25"])).toBe(`Give the course a name with --name. ${patternUsage}`);
    expect(parsePatternArgs(["--pattern", "flipped", "--name", "W"])).toBe(`Give the first Monday of teaching with --start, like 2027-01-25. ${patternUsage}`);
    expect(parsePatternArgs([...ok, "--weeks", "0"])).toBe("--weeks must be a whole number from 1 to 52.\n");
    expect(parsePatternArgs([...ok, "--weeks", "53"])).toBe("--weeks must be a whole number from 1 to 52.\n");
    expect(parsePatternArgs([...ok, "--weeks", "2.5"])).toBe("--weeks must be a whole number from 1 to 52.\n");
    expect(parsePatternArgs([...ok, "--reading-week", "12"])).toBe("--reading-week must be a teaching week before the last.\n");
    expect(parsePatternArgs([...ok, "--reading-week", "0"])).toBe("--reading-week must be a teaching week before the last.\n");
  });

  it("creates the course, prints the next steps, and refuses to overwrite one that exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "tutors-pattern-run-"));
    let out = "";
    let err = "";
    const io = { out: (t: string) => (out += t), err: (t: string) => (err += t) };
    expect(runPatternCreate([...ok, "--weeks", "2", "--out", dir], io)).toBe(0);
    expect(readdirSync(join(dir, "web-dev"))).toContain("calendar.yaml");
    expect(out).toContain("Course created in ./web-dev/");
    expect(runPatternCreate([...ok, "--out", dir], io)).toBe(1);
    expect(err).toContain("already exists");
    expect(readFileSync(join(dir, "web-dev/calendar.yaml"), "utf-8")).toContain("week: 2");
    expect(existsSync(join(dir, "web-dev/unit-1/topic-03"))).toBe(false);
  });

  it("reports a start date that is shaped right but not real, creating nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "tutors-pattern-run-"));
    let err = "";
    expect(runPatternCreate(["--pattern", "flipped", "--name", "W", "--start", "2027-02-30", "--out", dir], { out: () => {}, err: (t) => (err += t) })).toBe(1);
    expect(err).toBe('Could not create the course: "2027-02-30" is not a real date\n');
    expect(readdirSync(dir)).toEqual([]);
  });
});
