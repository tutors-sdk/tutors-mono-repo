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

// tutors.json is not described here: its contract is TUTORS_JSON_SCHEMA in @tutors/tutors-types
// (packages/jsr/types/src/tutors-json.ts), checked against real generator output in
// tests/contract/course/course-json.contract.test.ts.

// ---------------------------------------------------------------------------
// Whiteboard collaboration schemas
// ---------------------------------------------------------------------------

// The broadcasts below are what apps/reader/static/excalidraw-editor.html sends on its `wb:<room id>` channel, as
// payloads (the broker carries the event name). Their versions are in tests/contract/messages/contracts.ts (Rules
// 0623-0625), which drives the editor's own script to prove it sends and accepts these shapes.

export const WhiteboardPointerSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const WhiteboardElementSchema = z.object({
  id: z.string(),
  version: z.number(),
  type: z.string(),
}).passthrough();

/** `scene-update`: the elements that changed since this editor last sent them, at most four times a second. */
export const WhiteboardSceneUpdateSchema = z.object({
  elements: z.array(WhiteboardElementSchema),
});

/** `cursor-update`: one collaborator's pointer, coalesced to one broadcast per interval. */
export const WhiteboardCursorUpdateSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  color: z.string(),
  pointer: WhiteboardPointerSchema,
  button: z.enum(["up", "down"]),
});

/** What each editor tracks in the channel's presence: who is in the room, and their cursor colour. */
export const WhiteboardPresenceSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  avatar: z.string(),
  color: z.string(),
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
  /** The reader's appearance; Excalidraw opens in its matching theme. */
  theme: z.enum(["light", "dark"]).optional(),
});

/** Posted by the editor iframe to the reader after a batch of edits: the whole scene, with its image files. */
export const WhiteboardSceneChangedSchema = z.object({
  type: z.literal("scene-changed"),
  elements: z.array(WhiteboardElementSchema),
  files: z.record(
    z.object({
      id: z.string(),
      mimeType: z.string(),
      dataURL: z.string(),
    }).passthrough()
  ),
});

/** Sent to the viewer or editor iframe when the reader's appearance changes. */
export const WhiteboardSetThemeSchema = z.object({
  type: z.literal("set-theme"),
  theme: z.enum(["light", "dark"]),
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
export type WhiteboardSceneUpdate = z.infer<typeof WhiteboardSceneUpdateSchema>;
export type WhiteboardCursorUpdate = z.infer<typeof WhiteboardCursorUpdateSchema>;
