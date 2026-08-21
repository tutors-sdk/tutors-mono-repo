/**
 * Schema-validated fixture factories.
 *
 * Wraps the existing TestDataFactory with Zod validation at creation time,
 * ensuring every fixture used in BDD step definitions conforms to the
 * canonical API schemas. Failures here mean the test fixture has drifted
 * from the real API shape.
 */
import { z } from "zod";
import {
  LearningRecordSchema,
  CalendarEntrySchema,
  ConnectUserSchema,
  ConnectProfileSchema,
  ConnectCourseSchema,
  ConnectLatestSchema,
  LoRecordSchema,
  RealtimeChannelSchema,
  type LearningRecord,
  type CalendarEntry,
  type ConnectUser,
  type ConnectProfile,
  type ConnectCourse,
  type ConnectLatest,
  type LoRecord,
} from "../../contract/support/schemas";

// ---------------------------------------------------------------------------
// Validated factory functions
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(): string {
  return `fixture-${++idCounter}`;
}

function dateString(daysAgo: number = 0): string {
  const d = new Date(2024, 2, 15);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function createValidatedLearningRecord(overrides: Partial<LearningRecord> = {}): LearningRecord {
  const data: LearningRecord = {
    id: nextId(),
    courseid: "course-cs101",
    studentid: "student-1",
    lo_id: "lab-01",
    type: "lab",
    timeactive: 45,
    pageloads: 12,
    date: dateString(),
    ...overrides,
  };
  return LearningRecordSchema.parse(data);
}

export function createValidatedCalendarEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  const data: CalendarEntry = {
    id: dateString(),
    studentid: "student-1",
    courseid: "course-cs101",
    timeactive: 30,
    pageloads: 8,
    full_name: "Alice Student",
    ...overrides,
  };
  return CalendarEntrySchema.parse(data);
}

export function createValidatedConnectUser(overrides: Partial<ConnectUser> = {}): ConnectUser {
  const data: ConnectUser = {
    id: nextId(),
    github_id: "gh-12345",
    full_name: "Alice Student",
    avatar_url: "https://avatars.githubusercontent.com/u/12345",
    created_at: "2024-01-15T10:00:00Z",
    ...overrides,
  };
  return ConnectUserSchema.parse(data);
}

export function createValidatedConnectProfile(overrides: Partial<ConnectProfile> = {}): ConnectProfile {
  const data: ConnectProfile = {
    id: nextId(),
    github_id: "gh-12345",
    full_name: "Alice Student",
    avatar_url: "https://avatars.githubusercontent.com/u/12345",
    bio: "Computer science student",
    email: "alice@example.com",
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-03-15T14:30:00Z",
    ...overrides,
  };
  return ConnectProfileSchema.parse(data);
}

export function createValidatedConnectCourse(overrides: Partial<ConnectCourse> = {}): ConnectCourse {
  const data: ConnectCourse = {
    id: nextId(),
    courseid: "course-cs101",
    github_id: "gh-12345",
    role: "student",
    enrolled_at: "2024-01-20T09:00:00Z",
    ...overrides,
  };
  return ConnectCourseSchema.parse(data);
}

export function createValidatedConnectLatest(overrides: Partial<ConnectLatest> = {}): ConnectLatest {
  const data: ConnectLatest = {
    id: nextId(),
    courseid: "course-cs101",
    github_id: "gh-12345",
    lo_title: "Lab 01: Getting Started",
    lo_route: "/lab/lab-01",
    lo_img: "https://tutors.dev/img/lab-01.png",
    timestamp: "2024-03-15T14:30:00Z",
    ...overrides,
  };
  return ConnectLatestSchema.parse(data);
}

export function createValidatedLoRecord(overrides: Partial<LoRecord> = {}): LoRecord {
  const data: LoRecord = {
    courseId: "course-cs101",
    courseUrl: "https://tutors.dev/course/cs101",
    img: "https://tutors.dev/img/lab-01.png",
    title: "Lab 01: Getting Started",
    courseTitle: "Computer Science 101",
    loRoute: "/lab/lab-01",
    user: {
      fullName: "Alice Student",
      avatar: "https://avatars.githubusercontent.com/u/12345",
      id: "student-1",
      sentiment: "happy",
    },
    type: "lab",
    isPrivate: false,
    icon: { type: "fluent" },
    ...overrides,
  };
  return LoRecordSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Batch generators (validated)
// ---------------------------------------------------------------------------

export function createValidatedCalendarDataset(
  studentCount: number,
  dayCount: number,
  courseid: string = "course-cs101"
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (let s = 1; s <= studentCount; s++) {
    for (let d = 0; d < dayCount; d++) {
      entries.push(
        createValidatedCalendarEntry({
          studentid: `student-${s}`,
          id: dateString(d),
          courseid,
          timeactive: 10 + (s * 5) + (d * 3),
          pageloads: 2 + d,
          full_name: `Student ${s}`,
        })
      );
    }
  }
  return entries;
}

export function createValidatedLearningRecordDataset(
  studentCount: number,
  loCount: number,
  courseid: string = "course-cs101"
): LearningRecord[] {
  const records: LearningRecord[] = [];
  for (let s = 1; s <= studentCount; s++) {
    for (let l = 1; l <= loCount; l++) {
      records.push(
        createValidatedLearningRecord({
          studentid: `student-${s}`,
          lo_id: `lab-${l}`,
          courseid,
          timeactive: 15 + (s * 3) + (l * 7),
          pageloads: 1 + l,
        })
      );
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Validation boundary guard
// ---------------------------------------------------------------------------

export function assertSchemaAtBoundary<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Schema validation failed at boundary [${label}]:\n${issues}`);
  }
  return result.data;
}
