/**
 * Utility types and functions for learning objects
 */

import type { Lo } from "./learning-objects.ts";
import { LO_COMPOSITE_TYPES, LO_SIMPLE_TYPES, LO_TYPE_ORDER, LO_TYPES } from "../vocabulary.ts";

/**
 * Dynamic property collection for learning objects
 */
export class Properties {
  [key: string]: string;
}

/**
 * Simple learning object types, from the one vocabulary in `../vocabulary.ts`.
 * Used for type checking and filtering
 */
export const simpleTypes: string[] = [...LO_SIMPLE_TYPES];

/**
 * Composite learning object types, from the same vocabulary.
 * Used for type checking and filtering
 */
export const loCompositeTypes: string[] = [...LO_COMPOSITE_TYPES];

/**
 * All learning object types
 * Used for type checking and filtering
 */
export const loTypes: string[] = [...LO_TYPES];

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
export const preOrder: Map<string, number> = new Map(Object.entries(LO_TYPE_ORDER));

/**
 * Student interaction tracking for learning objects
 */
export interface LearningRecord {
  date: Date;
  pageLoads: number;
  timeActive: number;
}

