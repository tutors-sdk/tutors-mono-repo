/**
 * Schema-driven test data generators.
 *
 * Bridges Zod schemas to fast-check arbitraries and @anatine/zod-mock
 * for property-based testing and deterministic mock generation.
 */
import { z } from "zod";
import * as fc from "fast-check";
import {
  LearningRecordSchema,
  CalendarEntrySchema,
  ConnectUserSchema,
  ConnectProfileSchema,
  ConnectCourseSchema,
  ConnectLatestSchema,
  LoRecordSchema,
  LoRecordUserSchema,
  PartyKitRoomSchema,
  CourseJsonSchema,
  IncrementCalendarParamsSchema,
  GetCountLearningRecordsParamsSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// Core: Zod-to-fast-check bridge
// ---------------------------------------------------------------------------

function zodStringArb(schema: z.ZodString): fc.Arbitrary<string> {
  const checks = (schema as any)._def.checks ?? [];
  let minLength = 1;
  let maxLength = 100;
  let regex: RegExp | undefined;

  for (const check of checks) {
    if (check.kind === "min") minLength = Math.max(minLength, check.value);
    if (check.kind === "max") maxLength = Math.min(maxLength, check.value);
    if (check.kind === "regex") regex = check.regex;
    if (check.kind === "email") return fc.emailAddress();
    if (check.kind === "url") return fc.webUrl();
    if (check.kind === "uuid") return fc.uuid();
  }

  if (regex) {
    if (regex.source.includes("\\d{4}") && regex.source.includes("\\d{2}")) {
      return fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
        .map(d => d.toISOString().slice(0, 10)) as fc.Arbitrary<string>;
    }
    return fc.string({ minLength, maxLength });
  }

  return fc.string({ minLength, maxLength });
}

function zodNumberArb(schema: z.ZodNumber): fc.Arbitrary<number> {
  const checks = (schema as any)._def.checks ?? [];
  let min = -1e6;
  let max = 1e6;
  let isInt = false;

  for (const check of checks) {
    if (check.kind === "min") min = check.value;
    if (check.kind === "max") max = check.value;
    if (check.kind === "int") isInt = true;
  }

  return isInt
    ? fc.integer({ min: Math.ceil(min), max: Math.floor(max) })
    : fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
}

export function zodToArbitrary<T>(schema: z.ZodType<T>): fc.Arbitrary<T> {
  if (schema instanceof z.ZodString) {
    return zodStringArb(schema) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodNumber) {
    return zodNumberArb(schema) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodBoolean) {
    return fc.boolean() as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodLiteral) {
    return fc.constant((schema as any)._def.value) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodEnum) {
    return fc.constantFrom(...(schema as any)._def.values) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodArray) {
    const itemArb = zodToArbitrary((schema as any)._def.type);
    return fc.array(itemArb, { maxLength: 5 }) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodOptional) {
    const innerArb = zodToArbitrary((schema as any)._def.innerType);
    return fc.option(innerArb, { nil: undefined }) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodRecord) {
    const valArb = zodToArbitrary((schema as any)._def.valueType);
    return fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), valArb) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodUnion) {
    const options = (schema as any)._def.options.map((opt: z.ZodType) => zodToArbitrary(opt));
    return fc.oneof(...options) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodObject) {
    const shape = (schema as any)._def.shape();
    const arbShape: Record<string, fc.Arbitrary<unknown>> = {};
    for (const [key, val] of Object.entries(shape)) {
      arbShape[key] = zodToArbitrary(val as z.ZodType);
    }
    return fc.record(arbShape) as fc.Arbitrary<T>;
  }
  return fc.constant(null) as fc.Arbitrary<T>;
}

// ---------------------------------------------------------------------------
// Pre-built arbitraries for each Tutors schema
// ---------------------------------------------------------------------------

function lazyArb<T>(fn: () => fc.Arbitrary<T>): fc.Arbitrary<T> {
  return fc.constant(null).chain(() => fn());
}

export const learningRecordArb = lazyArb(() => zodToArbitrary(LearningRecordSchema));
export const calendarEntryArb = lazyArb(() => zodToArbitrary(CalendarEntrySchema));
export const connectUserArb = lazyArb(() => zodToArbitrary(ConnectUserSchema));
export const connectProfileArb = lazyArb(() => zodToArbitrary(ConnectProfileSchema));
export const connectCourseArb = lazyArb(() => zodToArbitrary(ConnectCourseSchema));
export const connectLatestArb = lazyArb(() => zodToArbitrary(ConnectLatestSchema));
export const loRecordUserArb = lazyArb(() => zodToArbitrary(LoRecordUserSchema));
export const loRecordArb = lazyArb(() => zodToArbitrary(LoRecordSchema));
export const partyKitRoomArb = lazyArb(() => zodToArbitrary(PartyKitRoomSchema));
export const incrementCalendarParamsArb = lazyArb(() => zodToArbitrary(IncrementCalendarParamsSchema));
export const getCountLearningRecordsParamsArb = lazyArb(() => zodToArbitrary(GetCountLearningRecordsParamsSchema));

// ---------------------------------------------------------------------------
// Deterministic mock generators (seeded, reproducible)
// ---------------------------------------------------------------------------

export function generateMock<T>(schema: z.ZodType<T>, seed: number = 42): T {
  const arb = zodToArbitrary(schema);
  const sample = fc.sample(arb, { seed, numValues: 1 });
  return sample[0];
}

export function generateMocks<T>(schema: z.ZodType<T>, count: number, seed: number = 42): T[] {
  const arb = zodToArbitrary(schema);
  return fc.sample(arb, { seed, numValues: count });
}

// ---------------------------------------------------------------------------
// Semantic generators (domain-aware data that passes Zod validation)
// ---------------------------------------------------------------------------

export function calendarEntryArbitrary(overrides: Partial<z.infer<typeof CalendarEntrySchema>> = {}) {
  return fc.record({
    id: fc
      .tuple(fc.constant(2024), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
      .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
    studentid: fc.integer({ min: 1, max: 999 }).map(n => `student-${n}`),
    courseid: fc.constant(overrides.courseid ?? "course-1"),
    timeactive: fc.integer({ min: 0, max: 1440 }),
    pageloads: fc.integer({ min: 0, max: 500 }),
    full_name: fc.constant(overrides.full_name).filter((v): v is string => v !== undefined),
  });
}

export function loRecordArbitrary(overrides: Partial<z.infer<typeof LoRecordSchema>> = {}) {
  return fc.record({
    courseId: fc.constant(overrides.courseId ?? "course-1"),
    courseUrl: fc.constant(overrides.courseUrl ?? "https://tutors.dev/course/test"),
    img: fc.option(fc.webUrl(), { nil: undefined }),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    courseTitle: fc.string({ minLength: 1, maxLength: 50 }),
    loRoute: fc.string({ minLength: 2, maxLength: 20, unit: "grapheme" }).map(s => `/${s.replace(/[^a-z0-9]/g, "x")}`),
    user: fc.record({
      fullName: fc.string({ minLength: 1, maxLength: 30 }),
      avatar: fc.webUrl(),
      id: fc.string({ minLength: 3, maxLength: 15, unit: "grapheme" }).map(s => s.replace(/[^a-z0-9]/g, "a")),
      sentiment: fc.option(fc.constantFrom("happy", "neutral", "confused"), { nil: undefined }),
    }),
    type: fc.constantFrom("lab", "talk", "note", "web", "github", "archive"),
    isPrivate: fc.boolean(),
    icon: fc.option(fc.dictionary(fc.constant("type"), fc.constant("icon")), { nil: undefined }),
  });
}

// ---------------------------------------------------------------------------
// Validation helpers for test boundaries
// ---------------------------------------------------------------------------

export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function validateSafe<T>(schema: z.ZodType<T>, data: unknown): { success: boolean; data?: T; errors?: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
