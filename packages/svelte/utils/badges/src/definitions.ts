/**
 * Badge definitions from a course's badges.yaml, which sits beside enrollment.yaml in the
 * course source. The generator reads the YAML; this module checks the parsed entries.
 *
 *   - id: html-explorer
 *     title: HTML explorer
 *     criteria: { opened-all: { topic: topic-01, type: lab } }
 *   - id: streak-7
 *     title: 7-day streak
 *     criteria: { active-days: 7 }
 *   - id: lab-helper
 *     title: Lab helper
 *     criteria: manual
 */

export type BadgeCriteria =
  /** Every learning object in the topic (optionally only those of one type) has been opened. */
  | { kind: "opened-all"; topic: string; type?: string }
  /** The student was active on at least this many distinct days in the course. */
  | { kind: "active-days"; days: number }
  /** Only an educator awards it. */
  | { kind: "manual" };

export interface BadgeDefinition {
  id: string;
  title: string;
  description?: string;
  criteria: BadgeCriteria;
}

export class BadgesFileError extends Error {
  constructor(
    readonly entry: number,
    message: string
  ) {
    super(`badges.yaml entry ${entry + 1}: ${message}`);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function parseCriteria(raw: unknown, entry: number): BadgeCriteria {
  if (raw === "manual") return { kind: "manual" };
  if (isRecord(raw) && Object.keys(raw).length === 1) {
    const opened = raw["opened-all"];
    if (isRecord(opened)) {
      if (!nonEmpty(opened.topic)) throw new BadgesFileError(entry, "opened-all needs a topic");
      if (opened.type !== undefined && !nonEmpty(opened.type)) throw new BadgesFileError(entry, "opened-all type must be a learning object type");
      return opened.type === undefined ? { kind: "opened-all", topic: opened.topic } : { kind: "opened-all", topic: opened.topic, type: opened.type };
    }
    const days = raw["active-days"];
    if (days !== undefined) {
      if (!Number.isInteger(days) || (days as number) < 1) throw new BadgesFileError(entry, "active-days must be a whole number of at least 1");
      return { kind: "active-days", days: days as number };
    }
  }
  throw new BadgesFileError(entry, `unknown criteria ${JSON.stringify(raw)}; expected opened-all, active-days or manual`);
}

/** The badge definitions in a parsed badges.yaml. Throws BadgesFileError naming the first bad entry. */
export function parseBadgeDefinitions(data: unknown): BadgeDefinition[] {
  if (data === undefined || data === null) return [];
  if (!Array.isArray(data)) throw new BadgesFileError(-1, "the file must be a list of badges");
  const seen = new Set<string>();
  return data.map((raw, entry) => {
    if (!isRecord(raw)) throw new BadgesFileError(entry, "each badge must be a mapping");
    if (!nonEmpty(raw.id)) throw new BadgesFileError(entry, "missing id");
    if (seen.has(raw.id)) throw new BadgesFileError(entry, `duplicate id ${raw.id}`);
    seen.add(raw.id);
    if (!nonEmpty(raw.title)) throw new BadgesFileError(entry, `badge ${raw.id} is missing a title`);
    const definition: BadgeDefinition = { id: raw.id, title: raw.title, criteria: parseCriteria(raw.criteria, entry) };
    if (nonEmpty(raw.description)) definition.description = raw.description;
    return definition;
  });
}
