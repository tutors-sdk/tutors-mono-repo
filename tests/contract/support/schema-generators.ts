/**
 * Schema-driven test data generators.
 *
 * Bridges Zod schemas to fast-check arbitraries for property-based testing.
 * Compatible with Zod 4 internals (_def.shape as object, format checks, etc.).
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
  RealtimeChannelSchema,
  IncrementCalendarParamsSchema,
  GetCountLearningRecordsParamsSchema,
  WhiteboardSceneInitSchema,
  WhiteboardSceneUpdateSchema,
  WhiteboardSceneSnapshotSchema,
  WhiteboardCursorUpdateSchema,
  WhiteboardRoomSchema,
  WhiteboardInitEditorSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// Zod 4 helpers
// ---------------------------------------------------------------------------

type AnyZod = z.ZodType<unknown>;

function getDef(schema: AnyZod): Record<string, unknown> {
  return ((schema as unknown as { _def: Record<string, unknown> })._def ?? {}) as Record<string, unknown>;
}

function getObjectShape(schema: AnyZod): Record<string, AnyZod> {
  const shape = getDef(schema).shape;
  if (typeof shape === "function") {
    return (shape as () => Record<string, AnyZod>)();
  }
  return (shape as Record<string, AnyZod>) ?? {};
}

/** Prefer simple, fast, always-valid URLs over fc.webUrl() (slow under high numRuns). */
const simpleUrlArb = fc.constantFrom(
  "https://example.com",
  "https://tutors.dev/avatar.png",
  "https://cdn.example.org/img/1.jpg",
  "http://localhost:5173/path"
);

/** Emails that satisfy Zod 4's stricter email format (fc.emailAddress() often does not). */
const simpleEmailArb = fc.constantFrom(
  "alice@example.com",
  "bob.smith@tutors.dev",
  "user+tag@mail.example.org",
  "dev@localhost.localdomain"
);

// ---------------------------------------------------------------------------
// Core: Zod-to-fast-check bridge
// ---------------------------------------------------------------------------

function zodStringArb(schema: z.ZodString): fc.Arbitrary<string> {
  const checks = (getDef(schema).checks as unknown[]) ?? [];
  let minLength = 1;
  let maxLength = 100;
  let regex: RegExp | undefined;

  for (const raw of checks) {
    const check = raw as Record<string, unknown> & {
      kind?: string;
      value?: number;
      regex?: RegExp;
      format?: string;
      _zod?: { def?: Record<string, unknown> };
      def?: Record<string, unknown>;
    };
    const def = check._zod?.def ?? check.def ?? {};
    const format = (check.format ?? def.format) as string | undefined;

    // Zod 4 string formats
    if (format === "email" || check.kind === "email") return simpleEmailArb;
    if (format === "url" || check.kind === "url") return simpleUrlArb;
    if (format === "uuid" || check.kind === "uuid") return fc.uuid();
    if (format === "regex" || def.check === "string_format") {
      const pattern = (def.pattern ?? check.regex) as RegExp | undefined;
      if (pattern instanceof RegExp) regex = pattern;
    }

    // Zod 3-style checks (kept for compatibility)
    if (check.kind === "min" && typeof check.value === "number") {
      minLength = Math.max(minLength, check.value);
    }
    if (check.kind === "max" && typeof check.value === "number") {
      maxLength = Math.min(maxLength, check.value);
    }
    if (check.kind === "regex" && check.regex instanceof RegExp) {
      regex = check.regex;
    }
  }

  if (regex) {
    // Date-like YYYY-MM-DD patterns used by calendar schemas
    if (regex.source.includes("\\d{4}") && regex.source.includes("\\d{2}")) {
      return fc
        .date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
        .map((d) => d.toISOString().slice(0, 10));
    }
    return fc.string({ minLength, maxLength });
  }

  return fc.string({ minLength, maxLength });
}

function zodNumberArb(schema: z.ZodNumber): fc.Arbitrary<number> {
  const checks = (getDef(schema).checks as unknown[]) ?? [];
  let min = -1e6;
  let max = 1e6;
  let isInt = false;

  for (const raw of checks) {
    const check = raw as Record<string, unknown> & {
      kind?: string;
      value?: number;
      isInt?: boolean;
      _zod?: { def?: Record<string, unknown> };
      def?: Record<string, unknown>;
    };
    const def = check._zod?.def ?? check.def ?? {};

    if (check.isInt || def.format === "safeint" || check.kind === "int") {
      isInt = true;
    }
    if (def.check === "greater_than" && typeof def.value === "number") {
      min = def.inclusive === false ? def.value + (isInt ? 1 : 0) : def.value;
    }
    if (def.check === "less_than" && typeof def.value === "number") {
      max = def.inclusive === false ? def.value - (isInt ? 1 : 0) : def.value;
    }
    if (check.kind === "min" && typeof check.value === "number") min = check.value;
    if (check.kind === "max" && typeof check.value === "number") max = check.value;
  }

  if (min > max) {
    [min, max] = [max, min];
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
    const values = (getDef(schema).values as unknown[]) ?? [getDef(schema).value];
    return fc.constant(values[0]) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodEnum) {
    const entries = getDef(schema).entries as Record<string, string> | undefined;
    const values = (getDef(schema).values as string[] | undefined) ?? Object.values(entries ?? {});
    return fc.constantFrom(...values) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodArray) {
    const element = (getDef(schema).element ?? getDef(schema).type) as AnyZod;
    const itemArb = zodToArbitrary(element);
    return fc.array(itemArb, { maxLength: 5 }) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodOptional) {
    const inner = getDef(schema).innerType as AnyZod;
    const innerArb = zodToArbitrary(inner);
    return fc.option(innerArb, { nil: undefined }) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodRecord) {
    const valType = getDef(schema).valueType as AnyZod;
    const valArb = zodToArbitrary(valType);
    return fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), valArb) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodUnion) {
    const options = (getDef(schema).options as AnyZod[]).map((opt) => zodToArbitrary(opt));
    return fc.oneof(...options) as fc.Arbitrary<T>;
  }
  if (schema instanceof z.ZodObject) {
    const shape = getObjectShape(schema);
    const arbShape: Record<string, fc.Arbitrary<unknown>> = {};
    for (const [key, val] of Object.entries(shape)) {
      arbShape[key] = zodToArbitrary(val);
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
export const realtimeChannelArb = lazyArb(() => zodToArbitrary(RealtimeChannelSchema));
export const incrementCalendarParamsArb = lazyArb(() => zodToArbitrary(IncrementCalendarParamsSchema));
export const getCountLearningRecordsParamsArb = lazyArb(() =>
  zodToArbitrary(GetCountLearningRecordsParamsSchema)
);
export const whiteboardSceneInitArb = lazyArb(() => zodToArbitrary(WhiteboardSceneInitSchema));
export const whiteboardSceneUpdateArb = lazyArb(() => zodToArbitrary(WhiteboardSceneUpdateSchema));
export const whiteboardSceneSnapshotArb = lazyArb(() => zodToArbitrary(WhiteboardSceneSnapshotSchema));
export const whiteboardCursorUpdateArb = lazyArb(() => zodToArbitrary(WhiteboardCursorUpdateSchema));
export const whiteboardRoomArb = lazyArb(() => zodToArbitrary(WhiteboardRoomSchema));
export const whiteboardInitEditorArb = lazyArb(() => zodToArbitrary(WhiteboardInitEditorSchema));

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
  const fullNameArb =
    overrides.full_name !== undefined
      ? fc.constant(overrides.full_name)
      : fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined });

  return fc.record({
    id: fc
      .tuple(fc.constant(2024), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
      .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
    studentid: fc.integer({ min: 1, max: 999 }).map((n) => `student-${n}`),
    courseid: fc.constant(overrides.courseid ?? "course-1"),
    timeactive: fc.integer({ min: 0, max: 1440 }),
    pageloads: fc.integer({ min: 0, max: 500 }),
    full_name: fullNameArb
  });
}

export function loRecordArbitrary(overrides: Partial<z.infer<typeof LoRecordSchema>> = {}) {
  return fc.record({
    courseId: fc.constant(overrides.courseId ?? "course-1"),
    courseUrl: fc.constant(overrides.courseUrl ?? "https://tutors.dev/course/test"),
    img: fc.option(simpleUrlArb, { nil: undefined }),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    courseTitle: fc.string({ minLength: 1, maxLength: 50 }),
    loRoute: fc
      .string({ minLength: 2, maxLength: 20, unit: "grapheme" })
      .map((s) => `/${s.replace(/[^a-z0-9]/g, "x")}`),
    user: fc.record({
      fullName: fc.string({ minLength: 1, maxLength: 30 }),
      avatar: simpleUrlArb,
      id: fc
        .string({ minLength: 3, maxLength: 15, unit: "grapheme" })
        .map((s) => s.replace(/[^a-z0-9]/g, "a")),
      sentiment: fc.option(fc.constantFrom("happy", "neutral", "confused"), { nil: undefined })
    }),
    type: fc.constantFrom("lab", "talk", "note", "web", "github", "archive"),
    isPrivate: fc.boolean(),
    icon: fc.option(fc.dictionary(fc.constant("type"), fc.constant("icon")), { nil: undefined })
  });
}

// ---------------------------------------------------------------------------
// Validation helpers for test boundaries
// ---------------------------------------------------------------------------

export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function validateSafe<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: boolean; data?: T; errors?: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
