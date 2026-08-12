import { supabase } from "@tutors/community";
import log from "@tutors/logger";
import type { Role, RoleAssignment } from "./types.ts";

export async function getUserRole(userId: string, courseId: string): Promise<Role> {
  if (typeof supabase === "undefined") return "student";
  if (!userId || !courseId) return "student";

  const { data: adminData, error: adminError } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("course_id", "")
    .eq("role", "admin")
    .maybeSingle();

  if (adminError) {
    log.error("getUserRole admin check failed:", adminError);
    return "student";
  }

  if (adminData) return "admin";

  const { data, error } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) {
    log.error("getUserRole failed:", error);
    return "student";
  }

  return (data?.role as Role) ?? "student";
}

export async function assignRole(
  userId: string,
  courseId: string,
  role: Role,
  assignedBy: string
): Promise<boolean> {
  if (typeof supabase === "undefined") return false;
  if (!userId || !assignedBy) return false;

  const { error } = await supabase.from("role_assignments").upsert(
    {
      user_id: userId,
      course_id: courseId,
      role,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString()
    },
    { onConflict: "user_id,course_id" }
  );

  if (error) {
    log.error("assignRole failed:", error);
    return false;
  }

  return true;
}

export async function revokeRole(userId: string, courseId: string): Promise<boolean> {
  if (typeof supabase === "undefined") return false;
  if (!userId) return false;

  const { error } = await supabase
    .from("role_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("course_id", courseId);

  if (error) {
    log.error("revokeRole failed:", error);
    return false;
  }

  return true;
}

export async function listRolesForCourse(courseId: string): Promise<RoleAssignment[]> {
  if (typeof supabase === "undefined") return [];
  if (!courseId) return [];

  const { data, error } = await supabase
    .from("role_assignments")
    .select("id, user_id, course_id, role, assigned_by, assigned_at")
    .eq("course_id", courseId)
    .order("assigned_at", { ascending: false });

  if (error) {
    log.error("listRolesForCourse failed:", error);
    return [];
  }

  return (data ?? []) as RoleAssignment[];
}
