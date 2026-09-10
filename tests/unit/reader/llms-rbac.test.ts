import { describe, it, expect } from "vitest";
import type { Course, Lo } from "@tutors/tutors-model-lib";
import { generateLlms } from "../../../apps/reader/src/routes/(course-reader)/llm/[courseid]/llms";

function buildCourse(): Course {
  return {
    title: "Test Course",
    courseUrl: "test-course.example.com",
    type: "course",
    los: [
      {
        type: "topic",
        id: "week-01",
        title: "Week 01",
        route: "/topic/test-course/week-01",
        los: [
          {
            type: "panelvideo",
            id: "intro",
            title: "Intro Video",
            route: "/video/test-course/week-01/intro",
            video: "youtube=abc123",
            los: [],
          } as Lo,
        ],
      } as Lo,
      {
        type: "topic",
        id: "week-02",
        title: "Week 02",
        route: "/topic/test-course/week-02",
        los: [],
      } as Lo,
      {
        type: "talk",
        id: "talk-01",
        title: "Talk 01",
        route: "/talk/test-course/talk-01",
        los: [],
      } as Lo,
    ],
  } as Course;
}

describe("reader generateLlms RBAC filtering", () => {
  const course = buildCourse();

  it("includes all topics and course-wide links by default", () => {
    const html = generateLlms(course);
    expect(html).toContain("Week 01");
    expect(html).toContain("Week 02");
    expect(html).toContain("test-course-complete-llms.txt");
    expect(html).toContain("test-course-complete-pdfs.zip");
    expect(html).toContain("Intro Video");
  });

  it("omits locked topics and their videos for students", () => {
    const html = generateLlms(course, {
      isVisible: (lo) => lo.route !== "/topic/test-course/week-01",
      hideCourseWideLinks: false,
    });
    expect(html).not.toContain("Week 01");
    expect(html).not.toContain("Intro Video");
    expect(html).toContain("Week 02");
    expect(html).toContain("test-course-complete-llms.txt");
  });

  it("hides course-wide download links when locks are active", () => {
    const html = generateLlms(course, {
      isVisible: () => true,
      hideCourseWideLinks: true,
    });
    expect(html).not.toContain("test-course-complete-llms.txt");
    expect(html).not.toContain("test-course-complete-pdfs.zip");
    expect(html).toContain("Week 01");
    expect(html).toContain("Week 02");
  });
});
