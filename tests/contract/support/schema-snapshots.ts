/**
 * Schema snapshot testing utilities.
 *
 * Converts Zod schemas to JSON Schema format for snapshot comparison.
 * Detects unintended schema drift between releases.
 */
import { z } from "zod";
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
} from "./schemas";

// ---------------------------------------------------------------------------
// Zod-to-JSON-Schema converter (lightweight, no external dependency)
// ---------------------------------------------------------------------------

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  if (schema instanceof z.ZodString) {
    return stringToJsonSchema(schema);
  }
  if (schema instanceof z.ZodNumber) {
    return numberToJsonSchema(schema);
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }
  if (schema instanceof z.ZodLiteral) {
    return { const: (schema as any).value };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: (schema as any).options };
  }
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema((schema as any)._def.element) };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as any)._def.innerType);
  }
  if (schema instanceof z.ZodRecord) {
    return {
      type: "object",
      additionalProperties: zodToJsonSchema((schema as any)._def.valueType),
    };
  }
  if (schema instanceof z.ZodUnion) {
    return {
      oneOf: (schema as any)._def.options.map((opt: z.ZodType) => zodToJsonSchema(opt)),
    };
  }
  if (schema instanceof z.ZodObject) {
    return objectToJsonSchema(schema);
  }
  return {};
}

function stringToJsonSchema(schema: z.ZodString): JsonSchema {
  const result: JsonSchema = { type: "string" };
  const s = schema as any;
  if (s.minLength != null) result.minLength = s.minLength;
  if (s.maxLength != null) result.maxLength = s.maxLength;
  if (s.format === "email") result.format = "email";
  if (s.format === "url") result.format = "uri";
  if (s.format === "uuid") result.format = "uuid";
  return result;
}

function numberToJsonSchema(schema: z.ZodNumber): JsonSchema {
  const result: JsonSchema = { type: "number" };
  const s = schema as any;
  if (s.minValue != null && s.minValue !== -Infinity) result.minimum = s.minValue;
  if (s.maxValue != null && s.maxValue !== Infinity) result.maximum = s.maxValue;
  if (s.isInt) result.type = "integer";
  return result;
}

function objectToJsonSchema(schema: z.ZodObject<any>): JsonSchema {
  const shape = (schema as any)._def.shape;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [key, val] of Object.entries(shape)) {
    const zodVal = val as z.ZodType;
    properties[key] = zodToJsonSchema(zodVal);
    if (!(zodVal instanceof z.ZodOptional)) {
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required: required.sort() } : {}),
  };
}

// ---------------------------------------------------------------------------
// Snapshot registry — canonical JSON Schema for each API surface
// ---------------------------------------------------------------------------

export const SCHEMA_SNAPSHOTS: Record<string, JsonSchema> = {
  LearningRecord: zodToJsonSchema(LearningRecordSchema),
  CalendarEntry: zodToJsonSchema(CalendarEntrySchema),
  ConnectUser: zodToJsonSchema(ConnectUserSchema),
  ConnectProfile: zodToJsonSchema(ConnectProfileSchema),
  ConnectCourse: zodToJsonSchema(ConnectCourseSchema),
  ConnectLatest: zodToJsonSchema(ConnectLatestSchema),
  LoRecord: zodToJsonSchema(LoRecordSchema),
  PartyKitRoom: zodToJsonSchema(PartyKitRoomSchema),
  CourseJson: zodToJsonSchema(CourseJsonSchema),
  IncrementCalendarParams: zodToJsonSchema(IncrementCalendarParamsSchema),
  GetCountLearningRecordsParams: zodToJsonSchema(GetCountLearningRecordsParamsSchema),
};

// ---------------------------------------------------------------------------
// Comparison utilities
// ---------------------------------------------------------------------------

export function getSchemaSnapshot(name: string): JsonSchema | undefined {
  return SCHEMA_SNAPSHOTS[name];
}

export function compareSchemas(name: string, currentSchema: z.ZodType): {
  match: boolean;
  expected: JsonSchema;
  actual: JsonSchema;
  diff: string[];
} {
  const expected = SCHEMA_SNAPSHOTS[name];
  const actual = zodToJsonSchema(currentSchema);

  if (!expected) {
    return { match: false, expected: {}, actual, diff: [`Schema "${name}" not found in snapshots`] };
  }

  const diff = findDiffs("$", expected, actual);
  return { match: diff.length === 0, expected, actual, diff };
}

function findDiffs(path: string, expected: any, actual: any): string[] {
  const diffs: string[] = [];

  if (typeof expected !== typeof actual) {
    diffs.push(`${path}: type mismatch (expected ${typeof expected}, got ${typeof actual})`);
    return diffs;
  }

  if (typeof expected !== "object" || expected === null) {
    if (expected !== actual) {
      diffs.push(`${path}: value mismatch (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    }
    return diffs;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      diffs.push(`${path}: expected array, got object`);
      return diffs;
    }
    if (expected.length !== actual.length) {
      diffs.push(`${path}: array length mismatch (expected ${expected.length}, got ${actual.length})`);
    }
    const len = Math.min(expected.length, actual.length);
    for (let i = 0; i < len; i++) {
      diffs.push(...findDiffs(`${path}[${i}]`, expected[i], actual[i]));
    }
    return diffs;
  }

  const allKeys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of allKeys) {
    if (!(key in expected)) {
      diffs.push(`${path}.${key}: unexpected field`);
    } else if (!(key in actual)) {
      diffs.push(`${path}.${key}: missing field`);
    } else {
      diffs.push(...findDiffs(`${path}.${key}`, expected[key], actual[key]));
    }
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Schema field inventory (for coverage audits)
// ---------------------------------------------------------------------------

export function listSchemaFields(schema: z.ZodType, prefix: string = ""): string[] {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as any)._def.shape;
    const fields: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      const path = prefix ? `${prefix}.${key}` : key;
      fields.push(path);
      const inner = val instanceof z.ZodOptional ? (val as any)._def.innerType : val;
      fields.push(...listSchemaFields(inner as z.ZodType, path));
    }
    return fields;
  }
  if (schema instanceof z.ZodArray) {
    return listSchemaFields((schema as any)._def.element, `${prefix}[]`);
  }
  return [];
}
