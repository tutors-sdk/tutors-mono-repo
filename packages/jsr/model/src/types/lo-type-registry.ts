/**
 * Registration seam for learning object types.
 *
 * Adding a learning object type used to mean editing the type lists here,
 * the ordering map, every theme's icon library and the static generator's
 * palette. A feature package now describes its type once with
 * {@link registerLoType}; the model lists, theme icon lookup and generator
 * palette all consult the registry as a fallback.
 */

import type { IconType } from "./icon-types.ts";
import { loCompositeTypes, loTypes, preOrder, simpleTypes } from "./type-utils.ts";

/** Colours used by the static site generator for a learning object type. */
export interface LoTypePalette {
  /** Iconify icon name for generated pages, e.g. "fluent:box-24-filled". */
  icon: string;
  /** Foreground colour for the type's icon and headings. */
  colour: string;
  /** Background colour used behind the type's cards. */
  background: string;
  /** Card border colour; defaults to `colour`. */
  border?: string;
  /** Card background colour; defaults to `background`. */
  cardBackground?: string;
}

export interface LoTypeDefinition {
  /** The `type` value on learning objects, e.g. "scorm". */
  type: string;
  /** True when the type contains child learning objects. */
  composite?: boolean;
  /** Position in the canonical ordering; appended after existing types when omitted. */
  order?: number;
  /** Icon used by readers when the active theme has no entry for the type. */
  icon?: IconType;
  /** Palette used by the static site generator. */
  palette?: LoTypePalette;
}

const registry = new Map<string, LoTypeDefinition>();

/** One past the largest known ordering value, so unordered types sort last. */
function nextOrder(): number {
  return Math.max(-1, ...preOrder.values()) + 1;
}

/**
 * Registers a learning object type so the model lists, theme icon lookup and
 * generator palette all know about it. Registering the same type twice
 * replaces its definition without duplicating list entries.
 */
export function registerLoType(definition: LoTypeDefinition): void {
  const { type, composite = false, order } = definition;
  const list = composite ? loCompositeTypes : simpleTypes;
  if (!list.includes(type)) {
    list.push(type);
  }
  if (!loTypes.includes(type)) {
    loTypes.push(type);
  }
  if (!preOrder.has(type) || order !== undefined) {
    preOrder.set(type, order ?? nextOrder());
  }
  registry.set(type, definition);
}

/** The registered definition for a type, if any. */
export function getLoTypeDefinition(type: string): LoTypeDefinition | undefined {
  return registry.get(type);
}

/** All types registered through {@link registerLoType}, in registration order. */
export function registeredLoTypes(): LoTypeDefinition[] {
  return [...registry.values()];
}
