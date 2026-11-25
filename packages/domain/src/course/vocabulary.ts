/**
 * Learning-object kinds and course icons.
 *
 * Each closed vocabulary is one `as const` list with its type derived from it, so adding a kind
 * is one edit and every `switch` over the type can be checked for exhaustiveness.
 */

/** Learning objects that hold content directly. Model-lib's `simpleTypes` is this list. */
export const LO_SIMPLE_TYPES = [
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
  "whiteboard",
  "quiz",
] as const;

/** Learning objects that contain other learning objects. Model-lib's `loCompositeTypes` is this list. */
export const LO_COMPOSITE_TYPES = ["unit", "side", "topic", "course"] as const;

/** Every learning-object kind. */
export const LO_TYPES = [...LO_SIMPLE_TYPES, ...LO_COMPOSITE_TYPES] as const;

export type LoSimpleType = (typeof LO_SIMPLE_TYPES)[number];
export type LoCompositeType = (typeof LO_COMPOSITE_TYPES)[number];
/** A learning-object kind, such as "lab" or "topic". Model-lib's `Lo.type` is still `string`. */
export type LoType = (typeof LO_TYPES)[number];

/**
 * Where a kind sorts among its siblings in a built course: containers first, then talks, then the
 * rest. A record over `LoType`, so a kind added to the lists above does not compile until it has a
 * place here; model-lib's `preOrder` is this record as a map.
 */
export const LO_TYPE_ORDER: Readonly<Record<LoType, number>> = {
  course: 0,
  unit: 1,
  side: 2,
  topic: 3,
  talk: 4,
  tutorial: 5,
  book: 6,
  lab: 7,
  note: 8,
  web: 9,
  github: 10,
  archive: 11,
  panelnote: 12,
  paneltalk: 13,
  panelvideo: 14,
  podcast: 15,
  notebook: 16,
  whiteboard: 17,
  quiz: 18,
};

const LO_TYPE_SET: ReadonlySet<string> = new Set(LO_TYPES);
const LO_COMPOSITE_SET: ReadonlySet<string> = new Set(LO_COMPOSITE_TYPES);

/** True when `value` is one of the learning-object kinds. */
export function isLoType(value: unknown): value is LoType {
  return typeof value === "string" && LO_TYPE_SET.has(value);
}

/** True when `value` is a kind that contains other learning objects. */
export function isLoCompositeType(value: unknown): value is LoCompositeType {
  return typeof value === "string" && LO_COMPOSITE_SET.has(value);
}

/**
 * A course or learning-object icon: an Iconify id and an optional CSS colour.
 *
 * The one shape for the four spellings in use today: model-lib `IconType` (`color: string`),
 * time-lib `TutorsConnectCourse.course_record.icon` (`color?: string`), time-lib
 * `CourseDisplayInfo.icon` (`color: string | null`) and lo-tree's companion icons. Each of those
 * is assignable to this type.
 */
export type CourseIcon = {
  type: string;
  color?: string | null;
};
