/**
 * @tutors/tutors-time-lib is a facade for one major version: the learning-activity domain
 * (calendar and lab models, their types and formatting helpers) now lives in
 * @tutors/domain/learning. The Supabase reading services stay here. Every export this package
 * had is still here, with the same name and behaviour.
 */
export type {
  CalendarEntry,
  CalendarMedianRow,
  CalendarMedianTable,
  CalendarModel,
  CalendarRow,
  CalendarTable,
  CourseDisplayInfo,
  LabMedianRow,
  LabMedianTable,
  LabModel,
  LabRow,
  LabTable,
  LabViewMode,
  LearningRecord,
  StudentDisplayInfo,
  TutorsConnectCourse,
  TutorsConnectUser,
  TutorsTimeCourse,
  TutorsTimeService,
  TutorsTimeStudent,
  ViewMode
} from "@tutors/domain/learning";
export {
  extractLabIdentifier,
  extractStepName,
  filterByDateRange,
  formatDateShort,
  formatTimeMinutesOnly,
  formatTimeNearestMinute,
  getDistinctSortedDates,
  getDistinctSortedDatesFromRecords,
  getDistinctSortedWeeks,
  getMondayForDate,
  heatColor,
  minutesOf,
  toggleLabViewMode
} from "@tutors/domain/learning";
export { BaseCalendarModel, BaseLabModel } from "@tutors/domain/learning";

export { getSupabase, initSupabase } from "./services/supabase.ts";
export { CourseTime } from "./services/course-time.ts";
export { TutorsTime } from "./services/tutors-time.ts";
