/**
 * The four ways a lecturer teaches, as data (the spec's "patterns are data, not UI"). A pattern says what
 * each weekly topic holds and what the side unit holds; the calendar decides how many topics there are.
 * Studio shows these as four cards; `tutors create --pattern <id>` takes the id. Kept as typed data in a
 * module, not YAML files, so generateCourseFiles stays pure and runs unchanged in the reader's browser.
 */
export type ItemKind = "talk" | "note" | "lab" | "archive";

export interface PatternItem {
  kind: ItemKind;
  /** The card title, with {n} replaced by the week number. */
  title: string;
}

export interface Pattern {
  id: PatternId;
  name: string;
  /** One line for the pattern's card. */
  description: string;
  pickedWhen: string;
  /** What every weekly topic holds, in order. */
  week: PatternItem[];
  /** What the side unit holds. */
  side: PatternItem[];
}

export type PatternId = "lecture-lab" | "lecture-only" | "project-based" | "flipped";

const handbook: PatternItem = { kind: "note", title: "Module handbook" };

export const patterns: readonly Pattern[] = [
  {
    id: "lecture-lab",
    name: "Lecture and lab",
    description: "Each week has slides and a six-step lab.",
    pickedWhen: "Most modules: a lecture, then a practical.",
    week: [
      { kind: "talk", title: "Week {n} lecture" },
      { kind: "lab", title: "Week {n} lab" }
    ],
    side: [handbook, { kind: "talk", title: "Introduction" }]
  },
  {
    id: "lecture-only",
    name: "Lecture only",
    description: "Each week has slides and a note for the readings.",
    pickedWhen: "Theory and seminar modules.",
    week: [
      { kind: "talk", title: "Week {n} lecture" },
      { kind: "note", title: "Week {n} readings" }
    ],
    side: [handbook]
  },
  {
    id: "project-based",
    name: "Project-based",
    description: "Each week has a brief and a lab for the milestone.",
    pickedWhen: "Capstones and studio modules.",
    week: [
      { kind: "note", title: "Week {n} brief" },
      { kind: "lab", title: "Week {n} milestone" }
    ],
    side: [
      { kind: "note", title: "Project specification" },
      { kind: "archive", title: "Starter code" }
    ]
  },
  {
    id: "flipped",
    name: "Flipped",
    description: "Each week has pre-reading, slides and an in-class lab.",
    pickedWhen: "Watch or read before class, practise in class.",
    week: [
      { kind: "note", title: "Week {n} pre-reading" },
      { kind: "talk", title: "Week {n} lecture" },
      { kind: "lab", title: "Week {n} in class" }
    ],
    side: [handbook]
  }
];

export function patternById(id: string): Pattern | undefined {
  return patterns.find((pattern) => pattern.id === id);
}

/** Teaching weeks per unit on the course home page: "Weeks 1–4", "Weeks 5–8", ... */
export const WEEKS_PER_UNIT = 4;
