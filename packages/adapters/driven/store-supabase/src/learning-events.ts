/**
 * Learning records in Supabase: page views and heartbeats, as the single-request functions of
 * supabase/migrations/20261014_record_page_view_and_heartbeat.sql write them, with the per-table
 * requests as the fallback until that migration is applied. `supabaseLearningEventSink` is the
 * application's LearningEventSink over these.
 */
import type { Course, Lo, TutorsId } from "@tutors/domain/course";
import { localYyyyMmDd } from "@tutors/domain/learning";
import type { LearningEventSink } from "@tutors/application/ports";
import log from "@tutors/logger";
import { supabase } from "./client.ts";

/**
 * Retrieves the number of learning record increments for a specific field
 * @async
 * @param fieldName - Name of the field to count increments for
 * @param courseId - Identifier of the course
 * @param studentId - Identifier of the student
 * @param loId - Identifier of the learning object
 * @returns Promise resolving to the number of increments
 */
async function getNumOfLearningRecordsIncrements(fieldName: string, courseId: string, studentId: string, loId: string) {
  if (!courseId || !studentId || !loId) return 0;

  const { data: student, error } = await supabase!.rpc("get_count_learning_records", {
    field_name: fieldName,
    course_base: courseId,
    user_name: studentId,
    lo_key: loId
  });

  if (error) {
    log.error("Error fetching student interaction:", error);
    return 0;
  }
  // No record yet comes back as an empty array, not null: the first visit counts as 1.
  return (student?.[0]?.increment ?? 0) + 1;
}

/**
 * Manages student interaction data with a course learning object
 * Updates both duration and count metrics
 * @async
 * @param courseId - Identifier of the course
 * @param studentId - Identifier of the student
 * @param loId - Identifier of the learning object
 * @param lo - Learning object data
 */
async function manageStudentCourseLo(courseId: string, studentId: string, loId: string, lo: Lo) {
  const durationPromise = getNumOfLearningRecordsIncrements("duration", courseId, studentId, loId);
  const countPromise = getNumOfLearningRecordsIncrements("count", courseId, studentId, loId);
  const [duration, count] = await Promise.all([durationPromise, countPromise]);
  const { error } = await supabase!.from("learning_records").upsert(
    {
      course_id: courseId,
      student_id: studentId,
      lo_id: loId,
      date_last_accessed: new Date().toISOString(),
      duration: duration,
      count: count,
      type: lo.type
    },
    {
      onConflict: "student_id, course_id, lo_id",
      ignoreDuplicates: false
    }
  );
  if (error) {
    log.error("Failed to upsert learning record:", error);
    throw error;
  }
}

/**
 * Formats a date into a standardized string format
 * @param date - Date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
  return localYyyyMmDd(new Date(date));
}

/**
 * Updates the duration of a calendar entry
 * @async
 * @param id - Calendar entry identifier
 * @param studentId - Identifier of the student
 * @param courseId - Identifier of the course
 */
export const updateCalendarDuration = async (id: string, studentId: string, courseId: string) => {
  if (!id || !studentId || !courseId || !supabase) return;
  await supabase!.rpc("increment_calendar", {
    field_name: "timeactive",
    row_id: id,
    student_id_value: studentId,
    course_id_value: courseId
  });
};

/**
 * Retrieves the duration from a calendar entry
 * @async
 * @param id - Calendar entry identifier
 * @param studentId - Identifier of the student
 * @param courseId - Identifier of the course
 * @returns Promise resolving to the duration value
 */
async function getCalendarDuration(id: string, studentId: string, courseId: string): Promise<number> {
  const { data } = await supabase!.from("calendar").select("timeactive").eq("id", id).eq("studentid", studentId).eq("courseid", courseId).maybeSingle();
  return data?.timeactive ? data.timeactive + 1 : 1;
}

/**
 * Retrieves the count from a calendar entry
 * @async
 * @param id - Calendar entry identifier
 * @param studentId - Identifier of the student
 * @param courseId - Identifier of the course
 * @returns Promise resolving to the count value
 */
async function getCalendarCount(id: string, studentId: string, courseId: string): Promise<number> {
  const { data } = await supabase!.from("calendar").select("pageloads").eq("id", id).eq("studentid", studentId).eq("courseid", courseId).maybeSingle();
  return data?.pageloads ? data.pageloads + 1 : 1;
}

/**
 * Creates or updates a calendar entry for a student's course interaction
 * @async
 * @param studentId - Identifier of the student
 * @param courseId - Identifier of the course
 */
async function insertOrUpdateCalendar(studentId: string, courseId: string, day: string = formatDate(new Date())) {
  if (!studentId || !courseId) return;
  const durationPromise = getCalendarDuration(day, studentId, courseId);
  const countPromise = getCalendarCount(day, studentId, courseId);
  const [timeActive, pageLoads] = await Promise.all([durationPromise, countPromise]);
  await supabase!.from("calendar").upsert(
    {
      id: day,
      studentid: studentId,
      timeactive: timeActive,
      pageloads: pageLoads,
      courseid: courseId
    },
    {
      onConflict: "id, studentid, courseid"
    }
  );
}

/**
 * Processes student interaction data with learning objects
 * @async
 * @param courseId - Identifier of the course
 * @param studentId - Identifier of the student
 * @param loId - Identifier of the learning object
 * @param lo - Learning object data
 */
async function handleInteractionData(courseId: string, studentId: string, loId: string, lo: Lo) {
  if (!courseId || !studentId || !loId) return;
  await manageStudentCourseLo(courseId, studentId, loId, lo);
}

/**
 * Stores student's interaction with a course learning object in Supabase
 * @async
 * @param course - Course data
 * @param loid - Learning object identifier
 * @param lo - Learning object data
 * @param student - Student data
 */
export async function storeStudentCourseLearningObjectInSupabase(course: Course, loid: string, lo: Lo, student: TutorsId) {
  await recordPageView(course.courseId, student.login, loid, lo.type, formatDate(new Date()));
}

/**
 * Records that a learner opened a learning object on `day`: one request where the recording
 * functions exist, the per-table requests otherwise.
 */
export async function recordPageView(courseId: string, studentId: string, loId: string, loType: string, day: string) {
  if (!supabase) return;
  if (courseId && studentId && loId) {
    const recorded = await callRecordingFunction("record_page_view", {
      p_course_id: courseId,
      p_student_id: studentId,
      p_lo_id: loId,
      p_lo_type: loType,
      p_day: day
    });
    if (recorded) return;
  }
  await handleInteractionData(courseId, studentId, loId, { type: loType } as Lo);
  await insertOrUpdateCalendar(studentId, courseId, day);
}

/**
 * Records 30 seconds of activity against the learning object (when there is one) and the day's calendar.
 * @param courseId - Identifier of the course
 * @param studentId - Identifier of the student
 * @param loId - Identifier of the learning object, or null when the page has none
 */
export async function recordHeartbeat(courseId: string, studentId: string, loId: string | null, day: string = formatDate(new Date())) {
  if (!supabase) return;
  if (!courseId || !studentId) return;
  const recorded = await callRecordingFunction("record_heartbeat", {
    p_course_id: courseId,
    p_student_id: studentId,
    p_lo_id: loId || null,
    p_day: day
  });
  if (recorded) return;
  if (loId) await updateLearningRecordsDuration(courseId, studentId, loId);
  await updateCalendarDuration(day, studentId, courseId);
}

/** The application's LearningEventSink over the recording functions above. */
export function supabaseLearningEventSink(): LearningEventSink {
  return {
    async record(event, learnerId) {
      if (event.kind === "page-load") {
        await recordPageView(event.courseId, learnerId, event.loId, event.loType, event.day);
      } else {
        await recordHeartbeat(event.courseId, learnerId, event.loId, event.day);
      }
    }
  };
}

/** PostgREST's code for a function its schema cache does not hold: the migration is not applied yet. */
const MISSING_FUNCTION = "PGRST202";
/**
 * Both functions ship in one migration, so once the database answers that one is missing, this tab
 * uses the per-table requests until it reloads, without asking again.
 */
export const recordingFunctions = { missing: false };

/**
 * Calls one of the single-request recording functions (supabase/migrations/20261014_record_page_view_and_heartbeat.sql).
 * Each replaces several read-then-write requests with one atomic write.
 * @returns true when the write is done (or failed and was logged); false when the caller should use the per-table requests
 */
async function callRecordingFunction(fn: "record_page_view" | "record_heartbeat", args: Record<string, unknown>): Promise<boolean> {
  if (recordingFunctions.missing || !supabase) return false;
  const { error } = await supabase.rpc(fn, args);
  if (!error) return true;
  if (error.code === MISSING_FUNCTION) {
    recordingFunctions.missing = true;
    log.warn("Single-request recording functions are missing; using per-table requests");
    return false;
  }
  log.error("Single-request recording failed:", fn, error);
  return true;
}

/**
 * Updates the duration metric for learning records
 * @async
 * @param courseId - Identifier of the course
 * @param studentId - Identifier of the student
 * @param loId - Identifier of the learning object
 */
export async function updateLearningRecordsDuration(courseId: string, studentId: string, loId: string) {
  if (!supabase) return;
  const numOfDuration = await getNumOfLearningRecordsIncrements("duration", courseId, studentId, loId);
  await supabase!.from("learning_records").update({ duration: numOfDuration }).eq("student_id", studentId).eq("course_id", courseId).eq("lo_id", loId);
}

