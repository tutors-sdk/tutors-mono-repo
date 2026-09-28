import { describe, it, expect, vi, beforeEach } from "vitest";

// The display lookups read one row through getSupabase(); stub the client so each test
// chooses the row (or error) that comes back.
let result: { data: unknown; error: unknown } = { data: null, error: null };
const from = vi.fn();

vi.mock("../../../packages/jsr/time/src/services/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      from(table);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => result,
      };
      return query;
    },
  }),
}));

const { TutorsTime } =
  await import("../../../packages/jsr/time/src/services/tutors-time");

beforeEach(() => {
  result = { data: null, error: null };
  from.mockClear();
});

// ===========================================================================
// getStudentDisplayInfo
// ===========================================================================
describe("TutorsTime.getStudentDisplayInfo", () => {
  it("returns an empty profile keyed by the trimmed id when the student has no row", async () => {
    const info = await TutorsTime.getStudentDisplayInfo("  octocat ");
    expect(from).toHaveBeenCalledWith("tutors-connect-users");
    expect(info).toEqual({
      github_id: "octocat",
      email: null,
      full_name: null,
      avatar_url: null,
      online_status: null,
      date_last_accessed: null,
      sentiment: null,
    });
  });

  it("maps the stored row, filling missing fields with null", async () => {
    result = {
      data: {
        github_id: " octocat ",
        full_name: "Octo Cat",
        email: "o@example.com",
      },
      error: null,
    };
    const info = await TutorsTime.getStudentDisplayInfo("octocat");
    expect(info).toEqual({
      github_id: "octocat",
      email: "o@example.com",
      full_name: "Octo Cat",
      avatar_url: null,
      online_status: null,
      date_last_accessed: null,
      sentiment: null,
    });
  });

  it("falls back to the requested id when the row's github_id is blank", async () => {
    result = { data: { github_id: "  " }, error: null };
    const info = await TutorsTime.getStudentDisplayInfo("octocat");
    expect(info.github_id).toBe("octocat");
  });
});

// ===========================================================================
// getCourseDisplayInfo
// ===========================================================================
describe("TutorsTime.getCourseDisplayInfo", () => {
  it("uses the course id as the title when the lookup fails or finds nothing", async () => {
    result = { data: null, error: { message: "boom" } };
    expect(await TutorsTime.getCourseDisplayInfo("web-dev")).toEqual({
      title: "web-dev",
      img: null,
      icon: null,
    });
    expect(from).toHaveBeenCalledWith("tutors-connect-courses");

    result = { data: null, error: null };
    expect(await TutorsTime.getCourseDisplayInfo("web-dev")).toEqual({
      title: "web-dev",
      img: null,
      icon: null,
    });
  });

  it("trims the title, image and icon from the course record", async () => {
    result = {
      data: {
        course_id: "web-dev",
        course_record: {
          title: " Web Dev ",
          img: " cover.png ",
          icon: { type: " fluent:book ", color: " teal " },
        },
      },
      error: null,
    };
    expect(await TutorsTime.getCourseDisplayInfo("web-dev")).toEqual({
      title: "Web Dev",
      img: "cover.png",
      icon: { type: "fluent:book", color: "teal" },
    });
  });

  it("falls back to the id for a blank title and drops a blank image, icon type or colour", async () => {
    result = {
      data: {
        course_id: "web-dev",
        course_record: {
          title: "  ",
          img: " ",
          icon: { type: "fluent:book", color: " " },
        },
      },
      error: null,
    };
    expect(await TutorsTime.getCourseDisplayInfo("other")).toEqual({
      title: "web-dev",
      img: null,
      icon: { type: "fluent:book", color: null },
    });

    result = {
      data: { course_id: "", course_record: { icon: { type: " " } } },
      error: null,
    };
    expect(await TutorsTime.getCourseDisplayInfo("other")).toEqual({
      title: "other",
      img: null,
      icon: null,
    });
  });
});
