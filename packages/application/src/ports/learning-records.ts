import type { CalendarEntry, LearningRecord, TutorsConnectUser } from "@tutors/domain/learning";

/** Reads what was recorded about a course's learners, for Tutors Time and the educator views. */
export interface LearningRecords {
  /** One row per learner per day with activity, within the inclusive `YYYY-MM-DD` range when given. */
  calendarEntries(courseId: string, start?: string | null, end?: string | null): Promise<CalendarEntry[]>;
  /** One row per learner per learning object, for one learner when `learnerId` is given. */
  learningRecords(courseId: string, learnerId?: string): Promise<LearningRecord[]>;
  /** The learners with any record in the course. */
  learners(courseId: string): Promise<TutorsConnectUser[]>;
}
