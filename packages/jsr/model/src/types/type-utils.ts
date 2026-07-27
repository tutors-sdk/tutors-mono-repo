/**
 * Utility types and functions for learning objects
 */

import type { Lo } from "./learning-objects.ts";

/**
 * Dynamic property collection for learning objects
 */
export class Properties {
  [key: string]: string;
}

/**
 * Simple learning object types
 * Used for type checking and filtering
 */
export const simpleTypes = [
  "note",
  "archive",
  "web",
  "github",
  "panelnote",
  "paneltalk",
  "panelvideo",
  "podcast",
  "talk",
  "book",
  "lab",
  "tutorial",
  "notebook",
];

/**
 * Composite learning object types
 * Used for type checking and filtering
 */
export const loCompositeTypes = ["unit", "side", "topic", "course"];

/**
 * All learning object types
 * Used for type checking and filtering
 */
export const loTypes: string[] = simpleTypes.concat(loCompositeTypes);

/**
 * Type alias for learning object types
 */
export type LoType = (typeof loTypes)[number];

/**
 * Checks if a learning object is composite (contains other Los)
 * @param lo Learning object to check
 * @returns boolean indicating if Lo is composite
 */
export function isCompositeLo(lo: Lo): boolean {
  return loCompositeTypes.includes(lo.type);
}

/**
 * Learning object type ordering
 * Used for sorting and display
 */
export const preOrder: Map<string, number> = new Map([
  ["course", 0],
  ["unit", 1],
  ["side", 2],
  ["topic", 3],
  ["talk", 4],
  ["tutorial", 5],
  ["book", 6],
  ["lab", 7],
  ["note", 8],
  ["web", 9],
  ["github", 10],
  ["archive", 11],
  ["panelnote", 12],
  ["paneltalk", 13],
  ["panelvideo", 14],
  ["podcast", 15],
  ["notebook", 16],
]);

/**
 * Student interaction tracking for learning objects
 */
export interface LearningRecord {
  date: Date;
  pageLoads: number;
  timeActive: number;
}

