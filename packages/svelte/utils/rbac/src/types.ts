export type Role = "student" | "educator";

export type Permission =
  | "broadcast"
  | "quiz:manage"
  | "analytics:view"
  | "content:lock";

export interface ContentLock {
  id?: string;
  course_id: string;
  lo_route: string;
  locked: boolean;
  locked_by: string;
  locked_at?: string;
}
