export type Role = "student" | "educator";

export type Permission =
  | "broadcast"
  | "quiz:manage"
  | "analytics:view"
  | "content:lock"
  // Reading the playground work students have handed in. Enforced in the database by the
  // policies on `playground_snapshots`; this is the same rule stated where the UI can ask.
  | "playground:view";

export interface ContentLock {
  id?: string;
  course_id: string;
  lo_route: string;
  locked: boolean;
  locked_by: string;
  locked_at?: string;
}
