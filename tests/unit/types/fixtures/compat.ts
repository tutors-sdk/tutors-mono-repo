/**
 * Type-level checks that @tutors/tutors-types describes the shapes already in use, so code can
 * move onto it without changing what it stores or sends. Compiled, never run, by
 * tests/unit/types/tutors-types.test.ts; any error here fails that test.
 */
import type {
  CourseIcon,
  CourseVisit,
  LoType,
  Sentiment,
  TutorsConnectCourseRow,
  TutorsConnectUserRow,
  LearningRecordRow,
  TutorsTableName,
} from "../../../../packages/jsr/types/src/index.ts";
import type {
  Archive,
  Course,
  CourseSentimentId,
  Github,
  IconType,
  Lab,
  Note,
  Notebook,
  PanelNote,
  PanelTalk,
  PanelVideo,
  Podcast,
  Side,
  Talk,
  Topic,
  Tutorial,
  Unit,
  Web,
  Whiteboard,
} from "../../../../packages/jsr/model/src/types/index.ts";
import type { CourseDisplayInfo, LearningRecord, TutorsConnectCourse, TutorsConnectUser } from "../../../../packages/jsr/time/src/types/index.ts";
import type { CourseVisit as ConnectCourseVisit } from "../../../../packages/svelte/connect/src/types.ts";

type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Every icon spelling in use today fits CourseIcon.
export type IconFromModel = Assert<Extends<IconType, CourseIcon>>;
export type IconFromTimeDisplay = Assert<Extends<NonNullable<CourseDisplayInfo["icon"]>, CourseIcon>>;
export type IconFromCourseRecord = Assert<Extends<NonNullable<NonNullable<TutorsConnectCourse["course_record"]>["icon"]>, CourseIcon>>;

// Every learning-object subtype model-lib defines is a LoType.
type ModelLoKinds =
  | Archive
  | Course
  | Github
  | Lab
  | Note
  | Notebook
  | PanelNote
  | PanelTalk
  | PanelVideo
  | Podcast
  | Side
  | Talk
  | Topic
  | Tutorial
  | Unit
  | Web
  | Whiteboard;
export type ModelKindsAreLoTypes = Assert<Extends<ModelLoKinds["type"], LoType>>;
// @ts-expect-error A free-form string is not a LoType.
export type StringIsNotLoType = Assert<Extends<string, LoType>>;

// Sentiment is model-lib's CourseSentimentId under its new name.
export type SentimentMatchesModel = Assert<Same<Sentiment, CourseSentimentId>>;

// The row types match time-lib's hand-written ones exactly.
export type UserRowMatchesTime = Assert<Same<TutorsConnectUserRow, TutorsConnectUser>>;
export type CourseRowMatchesTime = Assert<Same<TutorsConnectCourseRow, TutorsConnectCourse>>;
export type LearningRecordFitsRow = Assert<Extends<LearningRecord, LearningRecordRow>>;

// connect's course visits fit the shared CourseVisit.
export type ConnectVisitFits = Assert<Extends<ConnectCourseVisit, CourseVisit>>;

// The tables the time library reads have row types.
export type TimeTablesTyped = Assert<Extends<"tutors-connect-users" | "tutors-connect-courses" | "calendar" | "learning_records", TutorsTableName>>;
