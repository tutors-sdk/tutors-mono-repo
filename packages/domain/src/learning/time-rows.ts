/**
 * A course's stored learning activity as one answer: what an educator sees whole, and what a
 * student sees of their classmates.
 */
export interface TimeUserRow {
  github_id: string;
  full_name: string | null;
  avatar_url: string | null;
  online_status: string | null;
  sentiment: string | null;
  date_last_accessed: string | null;
}

export interface AssignmentSummary {
  id: number;
  name: string | null;
  url: string | null;
  due_date: string | null;
  opened_date: string | null;
  submissionCount: number;
}

export interface TimeRows {
  courseId: string;
  role: "educator" | "student";
  course: { course_id: string; course_record: unknown } | null;
  calendar: Record<string, unknown>[];
  learningRecords: Record<string, unknown>[];
  users: TimeUserRow[];
  assignments: AssignmentSummary[];
}

/**
 * A fresh random pseudonym for each classmate, per answer (Rule 0075). It is the same for one student
 * across the calendar and learning records of one answer, so medians still work, but it neither
 * follows row or alphabetical order nor survives to the next request: a viewer cannot link a
 * pseudonym across answers and single a classmate out over a term. The random source is the
 * caller's (`randomId`): the domain draws no random numbers of its own.
 */
export function pseudonymise(rows: TimeRows, viewer: string, randomId: () => string): TimeRows {
  const aliases = new Map<string, string>();
  const used = new Set<string>();
  const alias = (id: unknown): unknown => {
    if (typeof id !== "string" || id === viewer) return id;
    let a = aliases.get(id);
    if (!a) {
      do a = `student-${randomId().replace(/-/g, "").slice(0, 12)}`;
      while (used.has(a));
      aliases.set(id, a);
      used.add(a);
    }
    return a;
  };
  return {
    ...rows,
    role: "student",
    calendar: rows.calendar.map((r) => ({ ...r, studentid: alias(r.studentid) })),
    learningRecords: rows.learningRecords.map((r) => {
      const row: Record<string, unknown> = { ...r, student_id: alias(r.student_id) };
      delete row.full_name;
      return row;
    }),
    users: rows.users.filter((u) => u.github_id === viewer),
    assignments: []
  };
}
