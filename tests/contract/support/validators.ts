import type { ZodSchema } from "zod";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAgainstSchema<T>(data: unknown, schema: ZodSchema<T>): ValidationResult {
  const result = schema.safeParse(data);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
  };
}

export function validateArray<T>(data: unknown[], schema: ZodSchema<T>): ValidationResult {
  const allErrors: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const result = schema.safeParse(data[i]);
    if (!result.success) {
      for (const issue of result.error.issues) {
        allErrors.push(`[${i}].${issue.path.join(".")}: ${issue.message}`);
      }
    }
  }
  return { valid: allErrors.length === 0, errors: allErrors };
}

export function assertSchemaMatch<T>(data: unknown, schema: ZodSchema<T>, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Schema validation failed for ${label}:\n${errors}`);
  }
  return result.data;
}
