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

export const RealtimeChannelSchema = z.object({
  channelName: z.string(),
  type: z.enum(["global", "course"]),
});

/**
 * Lecturer → student real-time toast broadcast (issue #78).
 * Mirrors CourseBroadcast in packages/svelte/community/src/services/broadcast.ts.
 */
export const CourseBroadcastSchema = z.object({
  type: z.literal("course:broadcast"),
  id: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  actionUrl: z.string().optional(),
  actionLabel: z.string().optional(),
  senderName: z.string().min(1),
  sentAt: z.number(),
});

// ---------------------------------------------------------------------------
// Ephemeral gist sharing (issue #155)
// ---------------------------------------------------------------------------

/** A row in the `course_gists` table (public metadata, read-only for anon). */
export const CourseGistSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  expires_at: z.string(),
  course_id: z.string().min(1),
  // GitHub login of the creator.
  student_id: z.string().min(1),
  student_name: z.string().nullish(),
  // GitHub gist id (a UUID).
  gist_id: z.string().min(1),
  // https://gist.github.com/…
  gist_url: z.string().url(),
  title: z.string().nullish(),
  lo_route: z.string().nullish(),
  lo_title: z.string().nullish(),
});

/** A row in the `course_gist_secrets` table (anon-closed). */
export const CourseGistSecretSchema = z.object({
  gist_id: z.string().uuid(),
  github_token: z.string().min(1),
});

/** The `gist-created` broadcast payload on the course channel. */
export const GistCreatedEventSchema = z.object({
  type: z.literal("gist-created"),
  gistId: z.string().min(1),
  gistUrl: z.string().url(),
  course_id: z.string().min(1),
  student_id: z.string().min(1),
  student_name: z.string().optional(),
  title: z.string().optional(),
  lo_route: z.string().optional(),
  lo_title: z.string().optional(),
  expires_at: z.string().optional(),
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

// ---------------------------------------------------------------------------
// Whiteboard collaboration schemas
// ---------------------------------------------------------------------------

export const WhiteboardUserSchema = z.object({
  name: z.string(),
  id: z.string(),
  avatar: z.string(),
  color: z.string().optional(),
});

export const WhiteboardPointerSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const WhiteboardElementSchema = z.object({
  id: z.string(),
  version: z.number(),
  type: z.string(),
}).passthrough();

export const WhiteboardAppStateSchema = z.object({
  viewBackgroundColor: z.string(),
});

export const WhiteboardSceneInitSchema = z.object({
  type: z.literal("scene-init"),
  elements: z.array(WhiteboardElementSchema),
  appState: WhiteboardAppStateSchema,
  files: z.record(z.unknown()).optional(),
});

export const WhiteboardSceneUpdateSchema = z.object({
  type: z.literal("scene-update"),
  elements: z.array(WhiteboardElementSchema),
  source: z.string().optional(),
});

export const WhiteboardSceneSnapshotSchema = z.object({
  type: z.literal("scene-snapshot"),
  elements: z.array(WhiteboardElementSchema),
  appState: WhiteboardAppStateSchema,
  files: z.record(z.unknown()),
});

export const WhiteboardCursorUpdateSchema = z.object({
  type: z.literal("cursor-update"),
  user: WhiteboardUserSchema,
  pointer: WhiteboardPointerSchema,
  button: z.enum(["up", "down"]),
  source: z.string().optional(),
});

export const WhiteboardUserJoinedSchema = z.object({
  type: z.literal("user-joined"),
  user: WhiteboardUserSchema,
});

export const WhiteboardUserLeftSchema = z.object({
  type: z.literal("user-left"),
  userId: z.string(),
});

export const WhiteboardRoomSchema = z.object({
  roomId: z.string().regex(/^wb-/),
  type: z.literal("whiteboard"),
});

export const WhiteboardInitEditorSchema = z.object({
  type: z.literal("init-editor"),
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(1),
  roomId: z.string(),
  user: z.object({
    name: z.string(),
    id: z.string(),
    avatar: z.string(),
  }),
  initialScene: z.unknown().nullable(),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type LearningRecord = z.infer<typeof LearningRecordSchema>;
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;
export type ConnectUser = z.infer<typeof ConnectUserSchema>;
export type ConnectProfile = z.infer<typeof ConnectProfileSchema>;
export type ConnectCourse = z.infer<typeof ConnectCourseSchema>;
export type ConnectLatest = z.infer<typeof ConnectLatestSchema>;
export type LoRecord = z.infer<typeof LoRecordSchema>;
export type CourseJson = z.infer<typeof CourseJsonSchema>;
export type WhiteboardSceneInit = z.infer<typeof WhiteboardSceneInitSchema>;
export type WhiteboardSceneUpdate = z.infer<typeof WhiteboardSceneUpdateSchema>;
export type WhiteboardSceneSnapshot = z.infer<typeof WhiteboardSceneSnapshotSchema>;
export type WhiteboardCursorUpdate = z.infer<typeof WhiteboardCursorUpdateSchema>;
export type CourseBroadcast = z.infer<typeof CourseBroadcastSchema>;
export type CourseGist = z.infer<typeof CourseGistSchema>;
export type CourseGistSecret = z.infer<typeof CourseGistSecretSchema>;
export type GistCreatedEvent = z.infer<typeof GistCreatedEventSchema>;
