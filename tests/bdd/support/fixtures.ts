import type { MockCourse, MockTopic, MockUnit, MockLearningObject, PresenceEvent } from "./world";

let courseCounter = 0;
let topicCounter = 0;
let unitCounter = 0;
let loCounter = 0;
let studentCounter = 0;

export class TestDataFactory {
  createCourse(overrides: Partial<MockCourse> = {}): MockCourse {
    courseCounter++;
    return {
      id: `course-${courseCounter}`,
      title: `Course ${courseCounter}`,
      topics: [],
      properties: {},
      ...overrides
    };
  }

  createTopic(overrides: Partial<MockTopic> = {}): MockTopic {
    topicCounter++;
    return {
      id: `topic-${topicCounter}`,
      title: `Topic ${topicCounter}`,
      units: [],
      los: [],
      ...overrides
    };
  }

  createUnit(overrides: Partial<MockUnit> = {}): MockUnit {
    unitCounter++;
    return {
      id: `unit-${unitCounter}`,
      title: `Unit ${unitCounter}`,
      los: [],
      ...overrides
    };
  }

  createLearningObject(overrides: Partial<MockLearningObject> = {}): MockLearningObject {
    loCounter++;
    const type = overrides.type || "lab";
    return {
      type,
      title: `${type} ${loCounter}`,
      route: `/${type}-${loCounter}`,
      ...overrides
    };
  }

  createStudent(overrides: Record<string, unknown> = {}): { id: string; name: string; avatar: string; onlineStatus: string } {
    studentCounter++;
    return {
      id: `student-${studentCounter}`,
      name: `Student ${studentCounter}`,
      avatar: `https://avatars.example.com/${studentCounter}.png`,
      onlineStatus: "online",
      ...overrides
    };
  }

  createCalendarEntry(overrides: Record<string, unknown> = {}): { studentid: string; timeactive: number; id: string; courseid: string; pageloads: number } {
    const today = new Date().toISOString().slice(0, 10);
    return {
      studentid: `student-${studentCounter || 1}`,
      timeactive: Math.floor(Math.random() * 120),
      id: today,
      courseid: "course-1",
      pageloads: Math.floor(Math.random() * 50),
      ...overrides
    };
  }

  createLearningRecord(overrides: Record<string, unknown> = {}): { student_id: string; lo_id: string; duration: number; count: number; type: string; courseid: string } {
    return {
      student_id: `student-${studentCounter || 1}`,
      lo_id: `lab-${loCounter || 1}`,
      duration: Math.floor(Math.random() * 60),
      count: 1,
      type: "lab",
      courseid: "course-1",
      ...overrides
    };
  }

  createPresenceEvent(overrides: Partial<PresenceEvent> = {}): PresenceEvent {
    studentCounter++;
    return {
      courseId: "course-1",
      user: { fullName: `Student ${studentCounter}`, avatar: `https://avatars.example.com/${studentCounter}.png` },
      isPrivate: false,
      ...overrides
    };
  }

  createCourseWithTopics(id: string, topicCount: number, labsPerTopic: number): MockCourse {
    const topics: MockTopic[] = [];
    for (let t = 0; t < topicCount; t++) {
      const los: MockLearningObject[] = [];
      for (let l = 0; l < labsPerTopic; l++) {
        los.push(this.createLearningObject({ type: "lab" }));
      }
      topics.push(this.createTopic({ los }));
    }
    return this.createCourse({ id, topics });
  }

  createCalendarDataset(studentCount: number, dayCount: number): Array<{ studentid: string; timeactive: number; id: string; courseid: string; pageloads: number }> {
    const entries: Array<{ studentid: string; timeactive: number; id: string; courseid: string; pageloads: number }> = [];
    for (let s = 0; s < studentCount; s++) {
      for (let d = 0; d < dayCount; d++) {
        const date = new Date(2024, 0, d + 1).toISOString().slice(0, 10);
        entries.push(this.createCalendarEntry({ studentid: `student-${s + 1}`, id: date }));
      }
    }
    return entries;
  }

  createLabDataset(studentCount: number, labCount: number): Array<{ student_id: string; lo_id: string; duration: number; count: number; type: string; courseid: string }> {
    const records: Array<{ student_id: string; lo_id: string; duration: number; count: number; type: string; courseid: string }> = [];
    for (let s = 0; s < studentCount; s++) {
      for (let l = 0; l < labCount; l++) {
        records.push(this.createLearningRecord({ student_id: `student-${s + 1}`, lo_id: `lab-${l + 1}` }));
      }
    }
    return records;
  }
}
