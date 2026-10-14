/** Reads of `calendar`, `learning_records` and `tutors-connect-users`: the application's LearningRecords port. */
import type { CalendarEntry, LearningRecord, TutorsConnectUser } from "@tutors/domain/learning";
import type { LearningRecords } from "@tutors/application/ports";
import log from "@tutors/logger";
import { supabase } from "./client.ts";

export function supabaseLearningRecords(): LearningRecords {
  return {
    async calendarEntries(courseId, start, end) {
      if (!supabase || !courseId) return [];
      let query = supabase.from("calendar").select("*").eq("courseid", courseId);
      if (start) query = query.gte("id", start);
      if (end) query = query.lte("id", end);
      const { data, error } = await query;
      if (error) {
        log.error("calendarEntries failed:", error);
        return [];
      }
      return (data ?? []) as CalendarEntry[];
    },
    async learningRecords(courseId, learnerId) {
      if (!supabase || !courseId) return [];
      let query = supabase.from("learning_records").select("*").eq("course_id", courseId);
      if (learnerId) query = query.eq("student_id", learnerId);
      const { data, error } = await query;
      if (error) {
        log.error("learningRecords failed:", error);
        return [];
      }
      return (data ?? []) as LearningRecord[];
    },
    async learners(courseId) {
      if (!supabase || !courseId) return [];
      const { data: records, error } = await supabase.from("learning_records").select("student_id").eq("course_id", courseId);
      if (error || !records?.length) return [];
      const ids = [...new Set(records.map((r: { student_id: string }) => r.student_id))];
      const { data, error: usersError } = await supabase.from("tutors-connect-users").select("*").in("github_id", ids);
      if (usersError) {
        log.error("learners failed:", usersError);
        return [];
      }
      return (data ?? []) as TutorsConnectUser[];
    }
  };
}
