export type Role = "student" | "educator" | "admin";

export type Permission =
  | "broadcast"
  | "quiz:manage"
  | "analytics:view"
  | "course:manage"
  | "roles:assign"
  | "content:lock";

export interface RoleAssignment {
  id?: string;
  user_id: string;
  course_id: string;
  role: Role;
  assigned_by: string;
  assigned_at?: string;
}

export interface ContentLock {
  id?: string;
  course_id: string;
  lo_route: string;
  locked: boolean;
  locked_by: string;
  locked_at?: string;
}
