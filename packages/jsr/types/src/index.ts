/**
 * @tutors/tutors-types: the shared vocabulary every Tutors package and app can import.
 *
 * It is a facade over the domain (Rule 0130): the learning-object kinds, learner fields, events
 * and stored rows are defined in @tutors/domain and re-exported here under the names this package
 * has always had, so a theme, a UI primitive, a server route or the JSR CLI can use them without
 * pulling in Svelte, Supabase or markdown-it. The tutors.json schema is this package's own.
 *
 * The service ports this package once sketched (LearningEventSink, PresencePort, ProfilePort)
 * are now the real ports in @tutors/application/ports.
 */
export * from "@tutors/domain/course/vocabulary";
export { SENTIMENTS, DEFAULT_SENTIMENT, isSentiment, parseSentiment, ONLINE_STATUSES, parseSharing, onlineStatusFor } from "@tutors/domain/presence";
export type { Sentiment, OnlineStatus, LearnerDisplay, CourseVisit, PresenceEvent } from "@tutors/domain/presence";
export type {
  CalendarDay,
  LearningEvent,
  PageLoadEvent,
  TickEvent,
  LearningEventKind,
  TutorsConnectUserRow,
  TutorsConnectCourseRow,
  TutorsConnectLatestRow,
  CalendarDbRow,
  LearningRecordRow,
  AppErrorRow,
  TutorsTables,
  TutorsTableName
} from "@tutors/domain/learning";
export * from "./tutors-json.ts";
