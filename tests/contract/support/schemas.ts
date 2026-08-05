import { z } from "zod";

export const LearningRecordSchema = z.object({
  id: z.string(),
  courseid: z.string(),
  studentid: z.string(),
  lo_id: z.string(),
  type: z.string(),
  timeactive: z.number(),
  pageloads: z.number(),
  date: z.string(),
});

export const CalendarEntrySchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studentid: z.string(),
  courseid: z.string(),
  timeactive: z.number(),
  pageloads: z.number(),
  full_name: z.string().optional(),
});

export const IncrementCalendarParamsSchema = z.object({
  courseid: z.string(),
  studentid: z.string(),
  date: z.string(),
  timeactive: z.number(),
  pageloads: z.number(),
});

export const GetCountLearningRecordsParamsSchema = z.object({
  courseid: z.string(),
  studentid: z.string().optional(),
});

export const ConnectUserSchema = z.object({
  id: z.string(),
  github_id: z.string(),
  full_name: z.string(),
  avatar_url: z.string().url(),
  created_at: z.string(),
});

export const ConnectProfileSchema = z.object({
  id: z.string(),
  github_id: z.string(),
  full_name: z.string(),
  avatar_url: z.string().url(),
  bio: z.string().optional(),
  email: z.string().email().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ConnectCourseSchema = z.object({
  id: z.string(),
  courseid: z.string(),
  github_id: z.string(),
  role: z.enum(["student", "instructor"]),
  enrolled_at: z.string(),
});

export const ConnectLatestSchema = z.object({
  id: z.string(),
  courseid: z.string(),
  github_id: z.string(),
  lo_title: z.string(),
  lo_route: z.string(),
  lo_img: z.string().optional(),
  timestamp: z.string(),
});

export const LoRecordUserSchema = z.object({
  fullName: z.string(),
  avatar: z.string(),
  id: z.string(),
  sentiment: z.string().optional(),
});

export const LoRecordSchema = z.object({
  courseId: z.string(),
  courseUrl: z.string(),
  img: z.string().optional(),
  title: z.string(),
  courseTitle: z.string(),
  loRoute: z.string(),
  user: LoRecordUserSchema,
  type: z.string(),
  isPrivate: z.boolean(),
  icon: z.record(z.string()).optional(),
});

export const PartyKitRoomSchema = z.object({
  roomId: z.string(),
  type: z.enum(["global", "course"]),
});

const LoBaseSchema = z.object({
  type: z.string(),
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  contentMd: z.string(),
  route: z.string(),
  authLevel: z.number(),
  img: z.string(),
  video: z.string(),
  hide: z.boolean(),
});

const LabStepSchema = z.object({
  title: z.string(),
  shortTitle: z.string(),
  contentMd: z.string(),
  route: z.string(),
  id: z.string(),
  type: z.string(),
});

const TopicSchema = z.object({
  type: z.literal("topic"),
  id: z.string(),
  title: z.string(),
  route: z.string(),
  los: z.array(LoBaseSchema),
});

export const CourseJsonSchema = z.object({
  type: z.literal("course"),
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  route: z.string(),
  courseId: z.string(),
  courseUrl: z.string(),
  authLevel: z.number(),
  isPortfolio: z.boolean(),
  isPrivate: z.boolean(),
  los: z.array(z.union([TopicSchema, LoBaseSchema])),
});

export type LearningRecord = z.infer<typeof LearningRecordSchema>;
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;
export type ConnectUser = z.infer<typeof ConnectUserSchema>;
export type ConnectProfile = z.infer<typeof ConnectProfileSchema>;
export type ConnectCourse = z.infer<typeof ConnectCourseSchema>;
export type ConnectLatest = z.infer<typeof ConnectLatestSchema>;
export type LoRecord = z.infer<typeof LoRecordSchema>;
export type CourseJson = z.infer<typeof CourseJsonSchema>;
