/**
 * The service catalogue: the named parts of Tutors a session can touch.
 *
 * The heat maps plot one row (or column) per entry here, so a service with no
 * touches is still visible as an empty row - that is what makes the "silent
 * service" observation meaningful. Extend the list as services are added.
 */
export const SERVICES = [
  "reader",
  "search",
  "tutors-time",
  "live",
  "pdf",
  "video",
  "notes",
  "talk",
  "lab",
  "web-link",
  "github",
  "archive"
] as const;

/** A service in the catalogue. */
export type Service = (typeof SERVICES)[number];

/** Whether a string names a catalogued service. */
export function isService(value: unknown): value is Service {
  return typeof value === "string" && (SERVICES as readonly string[]).includes(value);
}

/**
 * Learning object type -> the service opening it exercises.
 *
 * Keep in step with `loTypes` in @tutors/tutors-model-lib. Types with no entry
 * (composites such as `topic`, and types with no service of their own such as
 * `whiteboard`) produce a `lo.viewed` event but no `service.used` event.
 */
const LO_TYPE_SERVICE: Record<string, Service> = {
  note: "notes",
  panelnote: "notes",
  talk: "talk",
  paneltalk: "pdf",
  panelvideo: "video",
  podcast: "video",
  book: "reader",
  tutorial: "reader",
  lab: "lab",
  web: "web-link",
  github: "github",
  archive: "archive"
};

/**
 * The service a learning object type belongs to, or undefined when the type is
 * a composite or has no catalogued service.
 */
export function serviceForLoType(loType: string | undefined): Service | undefined {
  if (!loType) return undefined;
  return LO_TYPE_SERVICE[loType];
}
