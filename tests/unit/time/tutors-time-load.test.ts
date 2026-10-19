import { describe, it, expect, vi, beforeEach } from "vitest";

// loadCourseTime and loadStudentTime sit on top of CourseTime and the two display lookups.
// Stub CourseTime with a fixed calendar and lab model, and the Supabase client with the rows
// the display lookups read, so these tests exercise only the assembly in tutors-time.ts.
const rows: Record<string, unknown> = {};
const loadTime = vi.fn();

vi.mock("../../../packages/jsr/time/src/services/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return query;
    },
  }),
}));

vi.mock("../../../packages/jsr/time/src/services/course-time", () => ({
  CourseTime: class {
    id = "";
    title = "";
    error: string | null = null;
    learningRecords: unknown[] = [];
    learningRecordsError: string | null = null;
    calendarModel = {
      dates: ["2026-10-12"],
      weeks: ["2026-W42"],
      week: { rows: [{ studentid: "octocat", full_name: "Octo Cat" }] },
      day: { rows: [{ studentid: "octocat" }] },
    };
    // Lab rows are keyed by display name, so the lookups fall back from the id to the name.
    labsModel = {
      labs: ["lab-1"],
      steps: ["step-1"],
      lab: { rows: [{ studentid: "Octo Cat" }] },
      step: { rows: [{ studentid: "Octo Cat" }] },
    };
    async loadTime(id: string, start: string | null, end: string | null, title: string) {
      // A test makes the learning records fail with loadTime.mockReturnValueOnce("<message>").
      this.learningRecordsError = loadTime(id, start, end, title) ?? null;
      this.id = id;
      this.title = title;
    }
  },
}));

const { TutorsTime } =
  await import("../../../packages/jsr/time/src/services/tutors-time");

beforeEach(() => {
  for (const key of Object.keys(rows)) delete rows[key];
  loadTime.mockClear();
});

describe("TutorsTime.loadCourseTime", () => {
  it("requires a course id", async () => {
    await expect(TutorsTime.loadCourseTime("")).rejects.toThrow("Course ID is required");
  });

  it("loads the course under its display title and reuses it when no dates are given", async () => {
    rows["tutors-connect-courses"] = { course_id: "web-1", course_record: { title: "Web Dev" } };
    const first = await TutorsTime.loadCourseTime("web-1");
    const second = await TutorsTime.loadCourseTime("web-1", "", null);
    expect(second).toBe(first);
    expect(loadTime.mock.calls).toEqual([["web-1", null, null, "Web Dev"]]);
  });

  it("loads a date range once, with trimmed dates, and keeps it apart from other ranges", async () => {
    const first = await TutorsTime.loadCourseTime("web-2", " 2026-10-01 ", "2026-10-31");
    const second = await TutorsTime.loadCourseTime("web-2", "2026-10-01", "2026-10-31");
    const other = await TutorsTime.loadCourseTime("web-2", "2026-10-01", null);
    const whole = await TutorsTime.loadCourseTime("web-2");
    expect(second).toBe(first);
    expect(other).not.toBe(first);
    expect(whole).not.toBe(first);
    expect(whole).not.toBe(other);
    expect(loadTime.mock.calls).toEqual([
      ["web-2", "2026-10-01", "2026-10-31", "web-2"],
      ["web-2", "2026-10-01", null, "web-2"],
      ["web-2", null, null, "web-2"],
    ]);
  });

  it("does not keep a load whose learning records failed, so a retry reaches the database", async () => {
    loadTime.mockReturnValueOnce("Failed to fetch learning records: timeout");
    const failed = await TutorsTime.loadCourseTime("web-3", "2026-10-01", "2026-10-31");
    expect(failed.learningRecordsError).toBe("Failed to fetch learning records: timeout");
    const retried = await TutorsTime.loadCourseTime("web-3", "2026-10-01", "2026-10-31");
    expect(retried).not.toBe(failed);
    expect(retried.learningRecordsError).toBeNull();
    expect(await TutorsTime.loadCourseTime("web-3", "2026-10-01", "2026-10-31")).toBe(retried);
    expect(loadTime).toHaveBeenCalledTimes(2);
  });

  it("does not keep an unfiltered load whose learning records failed", async () => {
    loadTime.mockReturnValueOnce("Failed to fetch learning records: timeout");
    const failed = await TutorsTime.loadCourseTime("web-4");
    expect(await TutorsTime.loadCourseTime("web-4")).not.toBe(failed);
    expect(loadTime).toHaveBeenCalledTimes(2);
  });
});

describe("TutorsTime.loadStudentTime", () => {
  it("requires a course id and a student id", async () => {
    await expect(TutorsTime.loadStudentTime("", "octocat")).rejects.toThrow("Course ID is required");
    await expect(TutorsTime.loadStudentTime("web-3", "")).rejects.toThrow("Student ID is required");
  });

  it("picks the student's calendar and lab rows, matching lab rows by display name", async () => {
    rows["tutors-connect-users"] = { github_id: "octocat", avatar_url: "https://a/octocat.png", online_status: "online" };
    const student = await TutorsTime.loadStudentTime("web-3", "octocat", "2026-10-01", "2026-10-31");
    expect(student).toMatchObject({
      courseid: "web-3",
      studentid: "octocat",
      studentName: "Octo Cat",
      avatarUrl: "https://a/octocat.png",
      online_status: "online",
      calendarByWeek: { studentid: "octocat" },
      calendarByDay: { studentid: "octocat" },
      labsByLab: { studentid: "Octo Cat" },
      labsByStep: { studentid: "Octo Cat" },
      labsByDay: null,
      hasData: true,
    });
    expect(student.course).toMatchObject({ dates: ["2026-10-12"], weeks: ["2026-W42"], labColumns: ["lab-1"], stepColumns: ["step-1"], labsMedianByDay: null });
  });

  it("reports no data for a student with no rows, named from their profile", async () => {
    rows["tutors-connect-users"] = { github_id: "hubot", full_name: " Hu Bot " };
    const student = await TutorsTime.loadStudentTime("web-3", "hubot", "2026-10-01", "2026-10-31");
    expect(student).toMatchObject({ studentName: "Hu Bot", calendarByWeek: null, labsByLab: null, labsByStep: null, hasData: false });
  });
});
