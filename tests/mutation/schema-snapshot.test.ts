import { describe, it, expect } from "vitest";
import {
  SCHEMA_SNAPSHOTS,
  compareSchemas,
  zodToJsonSchema,
  getSchemaSnapshot,
  listSchemaFields,
} from "../contract/support/schema-snapshots";
import {
  LearningRecordSchema,
  CalendarEntrySchema,
  ConnectUserSchema,
  ConnectProfileSchema,
  ConnectCourseSchema,
  ConnectLatestSchema,
  LoRecordSchema,
  PartyKitRoomSchema,
  CourseJsonSchema,
  IncrementCalendarParamsSchema,
  GetCountLearningRecordsParamsSchema,
} from "../contract/support/schemas";

describe("Schema Snapshot Regression", () => {
  const schemas = [
    { name: "LearningRecord", schema: LearningRecordSchema },
    { name: "CalendarEntry", schema: CalendarEntrySchema },
    { name: "ConnectUser", schema: ConnectUserSchema },
    { name: "ConnectProfile", schema: ConnectProfileSchema },
    { name: "ConnectCourse", schema: ConnectCourseSchema },
    { name: "ConnectLatest", schema: ConnectLatestSchema },
    { name: "LoRecord", schema: LoRecordSchema },
    { name: "PartyKitRoom", schema: PartyKitRoomSchema },
    { name: "CourseJson", schema: CourseJsonSchema },
    { name: "IncrementCalendarParams", schema: IncrementCalendarParamsSchema },
    { name: "GetCountLearningRecordsParams", schema: GetCountLearningRecordsParamsSchema },
  ];

  for (const { name, schema } of schemas) {
    it(`${name} schema has not drifted from snapshot`, () => {
      const { match, diff } = compareSchemas(name, schema);
      if (!match) {
        throw new Error(
          `Schema "${name}" has drifted from its snapshot:\n${diff.join("\n")}\n\n` +
          `If this change is intentional, update the snapshot in schema-snapshots.ts.`
        );
      }
      expect(match).toBe(true);
    });
  }

  it("snapshot registry covers all exported schemas", () => {
    const expectedNames = schemas.map((s) => s.name);
    for (const name of expectedNames) {
      expect(getSchemaSnapshot(name)).toBeDefined();
    }
  });

  it("no unexpected schemas in registry", () => {
    const knownNames = new Set(schemas.map((s) => s.name));
    for (const key of Object.keys(SCHEMA_SNAPSHOTS)) {
      expect(knownNames.has(key)).toBe(true);
    }
  });

  it("LearningRecord has expected field count", () => {
    const fields = listSchemaFields(LearningRecordSchema);
    const topLevel = fields.filter((f) => !f.includes("."));
    expect(topLevel.length).toBe(8);
  });

  it("LoRecord has nested user fields", () => {
    const fields = listSchemaFields(LoRecordSchema);
    expect(fields).toContain("user.fullName");
    expect(fields).toContain("user.avatar");
    expect(fields).toContain("user.id");
  });

  it("CourseJson has nested los array", () => {
    const jsonSchema = zodToJsonSchema(CourseJsonSchema);
    expect(jsonSchema.properties?.los).toBeDefined();
    expect(jsonSchema.properties?.los?.type).toBe("array");
  });
});
