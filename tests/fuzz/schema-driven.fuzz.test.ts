import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { z } from "zod";
import {
  calendarEntryArbitrary,
  loRecordArbitrary,
  learningRecordArb,
  connectUserArb,
  connectProfileArb,
  connectCourseArb,
  connectLatestArb,
  loRecordArb,
  realtimeChannelArb,
  incrementCalendarParamsArb,
  validateOrThrow,
  validateSafe,
} from "../contract/support/schema-generators";
import {
  LearningRecordSchema,
  CalendarEntrySchema,
  ConnectUserSchema,
  ConnectProfileSchema,
  ConnectCourseSchema,
  ConnectLatestSchema,
  LoRecordSchema,
  RealtimeChannelSchema,
  IncrementCalendarParamsSchema,
} from "../contract/support/schemas";
import {
  zodToJsonSchema,
  compareSchemas,
  listSchemaFields,
  SCHEMA_SNAPSHOTS,
} from "../contract/support/schema-snapshots";

const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || 100;

// ===========================================================================
// Schema round-trip: generated data always passes Zod validation
// ===========================================================================
describe("Schema-Driven Fuzz: round-trip validation", () => {
  it("LearningRecord: generated data passes schema", () => {
    fc.assert(
      fc.property(learningRecordArb, (record) => {
        expect(LearningRecordSchema.safeParse(record).success).toBe(true);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("ConnectUser: generated data passes schema", () => {
    fc.assert(
      fc.property(connectUserArb, (user) => {
        expect(ConnectUserSchema.safeParse(user).success).toBe(true);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("ConnectProfile: generated data passes schema", () => {
    fc.assert(
      fc.property(connectProfileArb, (profile) => {
        expect(ConnectProfileSchema.safeParse(profile).success).toBe(true);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("ConnectCourse: generated data passes schema", () => {
    fc.assert(
      fc.property(connectCourseArb, (course) => {
        expect(ConnectCourseSchema.safeParse(course).success).toBe(true);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("ConnectLatest: generated data passes schema", () => {
    fc.assert(
      fc.property(connectLatestArb, (latest) => {
        expect(ConnectLatestSchema.safeParse(latest).success).toBe(true);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("LoRecord: generated data passes schema", () => {
    fc.assert(
      fc.property(loRecordArb, (record) => {
        expect(LoRecordSchema.safeParse(record).success).toBe(true);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("RealtimeChannel: generated data passes schema", () => {
    fc.assert(
      fc.property(realtimeChannelArb, (channel) => {
        expect(RealtimeChannelSchema.safeParse(channel).success).toBe(true);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("IncrementCalendarParams: generated data passes schema", () => {
    fc.assert(
      fc.property(incrementCalendarParamsArb, (params) => {
        expect(IncrementCalendarParamsSchema.safeParse(params).success).toBe(true);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });
});

// ===========================================================================
// Semantic arbitraries: domain-aware generators
// ===========================================================================
describe("Schema-Driven Fuzz: semantic generators", () => {
  it("CalendarEntry dates are valid YYYY-MM-DD format", () => {
    fc.assert(
      fc.property(calendarEntryArbitrary(), (entry) => {
        expect(entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.timeactive).toBeGreaterThanOrEqual(0);
        expect(entry.timeactive).toBeLessThanOrEqual(1440);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("LoRecord routes start with /", () => {
    fc.assert(
      fc.property(loRecordArbitrary(), (record) => {
        expect(record.loRoute).toMatch(/^\//);
        expect(record.title.length).toBeGreaterThan(0);
        expect(record.user.fullName.length).toBeGreaterThan(0);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("LoRecord type is a valid LO type", () => {
    const validTypes = ["lab", "talk", "note", "web", "github", "archive"];
    fc.assert(
      fc.property(loRecordArbitrary(), (record) => {
        expect(validTypes).toContain(record.type);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });
});

// ===========================================================================
// Schema rejection: invalid data is correctly rejected
// ===========================================================================
describe("Schema-Driven Fuzz: rejection testing", () => {
  it("LearningRecord rejects missing required fields", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("id", "courseid", "studentid", "lo_id", "type", "timeactive", "pageloads", "date"),
        (fieldToRemove) => {
          const valid = {
            id: "rec-1",
            courseid: "cs101",
            studentid: "s1",
            lo_id: "lab-1",
            type: "lab",
            timeactive: 30,
            pageloads: 5,
            date: "2024-03-15",
          };
          const invalid = { ...valid };
          delete (invalid as any)[fieldToRemove];
          expect(LearningRecordSchema.safeParse(invalid).success).toBe(false);
        }
      ),
      { numRuns: 8 }
    );
  });

  it("CalendarEntry rejects invalid date format", () => {
    const badDates = ["2024/03/15", "15-03-2024", "March 15", "20240315", ""];
    for (const badDate of badDates) {
      const entry = {
        id: badDate,
        studentid: "s1",
        courseid: "cs101",
        timeactive: 30,
        pageloads: 5,
      };
      expect(CalendarEntrySchema.safeParse(entry).success).toBe(false);
    }
  });

  it("ConnectCourse rejects invalid role values", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s !== "student" && s !== "instructor"),
        (badRole) => {
          const course = {
            id: "c1",
            courseid: "cs101",
            github_id: "gh-1",
            role: badRole,
            enrolled_at: "2024-01-20T09:00:00Z",
          };
          expect(ConnectCourseSchema.safeParse(course).success).toBe(false);
        }
      ),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("ConnectUser rejects non-URL avatar_url", () => {
    // Zod 4 URL validation accepts many scheme-like strings (e.g. "A: ").
    // Generate values that are known-invalid rather than filtering on "http".
    const invalidUrlArb = fc.constantFrom(
      "not-a-url",
      "://missing-scheme",
      "just text",
      "",
      "http://"
    );
    fc.assert(
      fc.property(invalidUrlArb, (badUrl) => {
        const user = {
          id: "u1",
          github_id: "gh-1",
          full_name: "Test",
          avatar_url: badUrl,
          created_at: "2024-01-15T10:00:00Z"
        };
        expect(ConnectUserSchema.safeParse(user).success).toBe(false);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("RealtimeChannel rejects invalid channel type", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s !== "global" && s !== "course"),
        (badType) => {
          const channel = { channelName: "channel-1", type: badType };
          expect(RealtimeChannelSchema.safeParse(channel).success).toBe(false);
        }
      ),
      { numRuns: FUZZ_RUNS }
    );
  });
});

// ===========================================================================
// Schema snapshot stability
// ===========================================================================
describe("Schema-Driven Fuzz: snapshot stability", () => {
  it("all registered schemas have snapshots", () => {
    const expectedSchemas = [
      "LearningRecord", "CalendarEntry", "ConnectUser", "ConnectProfile",
      "ConnectCourse", "ConnectLatest", "LoRecord", "RealtimeChannel",
      "CourseJson", "IncrementCalendarParams", "GetCountLearningRecordsParams",
    ];
    for (const name of expectedSchemas) {
      expect(SCHEMA_SNAPSHOTS[name]).toBeDefined();
    }
  });

  it("LearningRecord schema snapshot matches current schema", () => {
    const { match, diff } = compareSchemas("LearningRecord", LearningRecordSchema);
    expect(diff).toEqual([]);
    expect(match).toBe(true);
  });

  it("CalendarEntry schema snapshot matches current schema", () => {
    const { match, diff } = compareSchemas("CalendarEntry", CalendarEntrySchema);
    expect(diff).toEqual([]);
    expect(match).toBe(true);
  });

  it("LoRecord schema snapshot matches current schema", () => {
    const { match, diff } = compareSchemas("LoRecord", LoRecordSchema);
    expect(diff).toEqual([]);
    expect(match).toBe(true);
  });

  it("ConnectUser schema snapshot matches current schema", () => {
    const { match, diff } = compareSchemas("ConnectUser", ConnectUserSchema);
    expect(diff).toEqual([]);
    expect(match).toBe(true);
  });

  it("schema field inventory captures all fields", () => {
    const fields = listSchemaFields(LearningRecordSchema);
    expect(fields).toContain("id");
    expect(fields).toContain("courseid");
    expect(fields).toContain("studentid");
    expect(fields).toContain("timeactive");
  });

  it("nested schema field inventory captures nested fields", () => {
    const fields = listSchemaFields(LoRecordSchema);
    expect(fields).toContain("user");
    expect(fields).toContain("user.fullName");
    expect(fields).toContain("user.avatar");
    expect(fields).toContain("user.id");
  });
});

// ===========================================================================
// Validation helpers
// ===========================================================================
describe("Schema-Driven Fuzz: validation helpers", () => {
  it("validateOrThrow passes valid data through", () => {
    const valid = {
      id: "rec-1", courseid: "cs101", studentid: "s1",
      lo_id: "lab-1", type: "lab", timeactive: 30, pageloads: 5, date: "2024-03-15",
    };
    const result = validateOrThrow(LearningRecordSchema, valid);
    expect(result.id).toBe("rec-1");
  });

  it("validateOrThrow throws on invalid data", () => {
    expect(() => validateOrThrow(LearningRecordSchema, { id: "bad" })).toThrow();
  });

  it("validateSafe returns success for valid data", () => {
    const valid = {
      id: "rec-1", courseid: "cs101", studentid: "s1",
      lo_id: "lab-1", type: "lab", timeactive: 30, pageloads: 5, date: "2024-03-15",
    };
    const result = validateSafe(LearningRecordSchema, valid);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("validateSafe returns errors for invalid data", () => {
    const result = validateSafe(LearningRecordSchema, { id: "bad" });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });
});

// ===========================================================================
// zodToJsonSchema conversion
// ===========================================================================
describe("Schema-Driven Fuzz: JSON Schema conversion", () => {
  it("converts string schema", () => {
    const js = zodToJsonSchema(z.string());
    expect(js.type).toBe("string");
  });

  it("converts number schema", () => {
    const js = zodToJsonSchema(z.number());
    expect(js.type).toBe("number");
  });

  it("converts boolean schema", () => {
    const js = zodToJsonSchema(z.boolean());
    expect(js.type).toBe("boolean");
  });

  it("converts enum schema", () => {
    const js = zodToJsonSchema(z.enum(["a", "b", "c"]));
    expect(js.enum).toEqual(["a", "b", "c"]);
  });

  it("converts object schema with required fields", () => {
    const js = zodToJsonSchema(z.object({ name: z.string(), age: z.number() }));
    expect(js.type).toBe("object");
    expect(js.properties).toBeDefined();
    expect(js.required).toContain("age");
    expect(js.required).toContain("name");
  });

  it("converts object schema with optional fields", () => {
    const js = zodToJsonSchema(z.object({ name: z.string(), bio: z.string().optional() }));
    expect(js.required).toContain("name");
    expect(js.required).not.toContain("bio");
  });

  it("converts array schema", () => {
    const js = zodToJsonSchema(z.array(z.string()));
    expect(js.type).toBe("array");
    expect(js.items).toEqual({ type: "string" });
  });

  it("converts literal schema", () => {
    const js = zodToJsonSchema(z.literal("course"));
    expect(js.const).toBe("course");
  });
});
