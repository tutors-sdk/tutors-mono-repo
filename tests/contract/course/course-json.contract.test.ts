import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TUTORS_JSON_SCHEMA } from "../../../packages/jsr/types/src/tutors-json.ts";
import { tutorsJsonErrors } from "../../../scripts/checks/lib/tutors-json.ts";
import { schemaText } from "../../../scripts/generate-tutors-json-schema.ts";
import { REPO_ROOT } from "../../../scripts/checks/lib/repo.ts";
import { syntheticTutorsJson } from "../../support/synthetic-course.ts";

/**
 * The tutors.json contract, held against what the generator really writes.
 *
 * The producer is packages/jsr/gen (parseCourse, then JSON.stringify in generateDynamicCourse); the
 * consumer is the reader's course service. The schema is TUTORS_JSON_SCHEMA in @tutors/tutors-types.
 * Rule 0262 states the requirement; these tests pin the schema's edges.
 */
describe("tutors.json contract", () => {
  it("the generator's output for the synthetic corpus course conforms", () => {
    expect(tutorsJsonErrors(syntheticTutorsJson().json)).toEqual([]);
  });

  it("the published tutors-json.schema.json is the schema in @tutors/tutors-types (pnpm generate:tutors-json-schema)", () => {
    const published = readFileSync(join(REPO_ROOT, "packages/jsr/types/tutors-json.schema.json"), "utf8");
    expect(published.replaceAll("\r\n", "\n")).toBe(schemaText());
    expect(JSON.parse(published)).toEqual(TUTORS_JSON_SCHEMA);
  });

  describe("refuses what the reader cannot rely on", () => {
    const course = () => syntheticTutorsJson().json;
    const find = (json: ReturnType<typeof course>, id: string) => json.los.flatMap((topic) => [topic, ...(topic.los ?? [])]).find((lo) => lo.id === id)!;

    it("a course whose root is not a course at route /", () => {
      const json = course() as Record<string, unknown>;
      json.type = "topic";
      json.route = "/topic/x";
      expect(tutorsJsonErrors(json)).toEqual(["/type must be equal to constant", "/route must be equal to constant"]);
    });

    it("a learning object of a kind no reader knows", () => {
      const json = course();
      json.los[0].type = "module";
      expect(tutorsJsonErrors(json)).toContain("/los/[topic-01-typical]/type must be equal to one of the allowed values");
    });

    it("a course nested inside a course", () => {
      const json = course();
      json.los[0].type = "course";
      expect(tutorsJsonErrors(json)).toContain("/los/[topic-01-typical]/type must be equal to one of the allowed values");
    });

    it("a field that belongs to another kind, such as a pdf on a note", () => {
      const json = course();
      (find(json, "unit-2").los!.find((lo) => lo.id === "note-1") as Record<string, unknown>).pdf = "https://{{COURSEURL}}/x.pdf";
      expect(tutorsJsonErrors(json)).toEqual(["/los/[topic-01-typical]/los/[unit-2]/los/[note-1] has a field the schema does not allow: pdf"]);
    });

    it("a talk without its pdf fields", () => {
      const json = course();
      delete (find(json, "unit-1").los!.find((lo) => lo.id === "talk-1") as Record<string, unknown>).pdfFile;
      expect(tutorsJsonErrors(json)).toEqual(["/los/[topic-01-typical]/los/[unit-1]/los/[talk-1] must have required property 'pdfFile'"]);
    });

    it("a lab step with a field of its own", () => {
      const json = course();
      const lab = find(json, "unit-1").los!.find((lo) => lo.id === "book-a")!;
      (lab.los![0] as Record<string, unknown>).order = 1;
      expect(tutorsJsonErrors(json)).toEqual(["/los/[topic-01-typical]/los/[unit-1]/los/[book-a]/los/[Lab-1] has a field the schema does not allow: order"]);
    });

    it("a learning object whose hide is not a boolean or whose authLevel is not a number", () => {
      const json = course() as unknown as { los: Record<string, unknown>[] };
      json.los[1].hide = "false";
      json.los[1].authLevel = "0";
      expect(tutorsJsonErrors(json)).toEqual(["/los/[topic-02-side]/hide must be boolean", "/los/[topic-02-side]/authLevel must be number"]);
    });

    it("leaves author-written YAML and front matter open", () => {
      const json = course();
      json.properties = { ...json.properties, anyNewKey: { nested: [1, 2] } };
      json.los[0].frontMatter = { order: 3, custom: "yes" };
      expect(tutorsJsonErrors(json)).toEqual([]);
    });
  });
});
