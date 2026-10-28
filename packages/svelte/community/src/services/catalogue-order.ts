/**
 * Sorting and searching the catalogue (issue #549, Rules 0674-0677). The catalogue page loads every established
 * course once; the visitor then reorders and narrows that list in the browser, so this is a pure function of the
 * loaded courses, the chosen order and the search text.
 */

/** The orders a visitor can pick, the first being the catalogue's default. */
export const CATALOGUE_SORTS = ["visits", "recent", "title", "credits"] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];

/** The fields of a catalogue course that ordering and searching read. */
export interface CatalogueCourse {
  title?: string;
  credits?: string;
  visits?: number;
  lastVisit?: string;
}

export function isCatalogueSort(value: unknown): value is CatalogueSort {
  return CATALOGUE_SORTS.includes(value as CatalogueSort);
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Alphabetic by a text field, a course without that text after every course with it. */
function byText(field: "title" | "credits") {
  return (a: CatalogueCourse, b: CatalogueCourse) => {
    const left = a[field]?.trim() ?? "";
    const right = b[field]?.trim() ?? "";
    if (!left || !right) return Number(!left) - Number(!right);
    return collator.compare(left, right);
  };
}

/** The time of a course's last visit, a course with no readable time before every other. */
function visitedAt(course: CatalogueCourse): number {
  const time = Date.parse(course.lastVisit ?? "");
  return Number.isNaN(time) ? -Infinity : time;
}

const ORDERS: Record<CatalogueSort, (a: CatalogueCourse, b: CatalogueCourse) => number> = {
  visits: (a, b) => (b.visits ?? 0) - (a.visits ?? 0),
  recent: (a, b) => visitedAt(b) - visitedAt(a) || 0,
  title: byText("title"),
  credits: byText("credits")
};

/** Letters NFD leaves whole, spelled as a visitor without them on their keyboard would type them. */
const UNDECOMPOSED: Record<string, string> = { ł: "l", ø: "o", đ: "d", ħ: "h", ı: "i", ß: "ss", æ: "ae", œ: "oe", þ: "th", ð: "d" };

/** Lower case with accents and the letters above folded away, so "Łódź" reads as "lodz". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[łøđħıßæœþð]/g, (letter) => UNDECOMPOSED[letter]);
}

/** Whether a course's title or credits contain every word of the search text, ignoring case and accents. */
export function matchesCatalogueSearch(course: CatalogueCourse, search: string): boolean {
  const haystack = fold(`${course.title ?? ""}\n${course.credits ?? ""}`);
  return fold(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * The courses to show: those matching the search, in the chosen order. Courses that tie keep their order in the
 * catalogue as loaded (most visited first), so the order is the same on every visit.
 */
export function arrangeCatalogue<T extends CatalogueCourse>(courses: readonly T[], sort: CatalogueSort, search = ""): T[] {
  return courses.filter((course) => matchesCatalogueSearch(course, search)).sort(ORDERS[sort]);
}
