/**
 * Learning-object kinds and course icons.
 *
 * Each closed vocabulary is one `as const` list with its type derived from it, so adding a kind
 * is one edit and every `switch` over the type can be checked for exhaustiveness.
 */

/** Learning objects that hold content directly. Same members as model-lib's `simpleTypes`. */
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

/** Learning objects that contain other learning objects. Same members as model-lib's `loCompositeTypes`. */
export const LO_COMPOSITE_TYPES = ["unit", "side", "topic", "course"] as const;

/** Every learning-object kind. */
export const LO_TYPES = [...LO_SIMPLE_TYPES, ...LO_COMPOSITE_TYPES] as const;

export type LoSimpleType = (typeof LO_SIMPLE_TYPES)[number];
export type LoCompositeType = (typeof LO_COMPOSITE_TYPES)[number];
/** A learning-object kind, such as "lab" or "topic". Model-lib's `Lo.type` is still `string`. */
export type LoType = (typeof LO_TYPES)[number];

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
