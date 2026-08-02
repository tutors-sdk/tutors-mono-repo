import { TestDataFactory } from "./fixtures";

export interface PresenceEvent {
  courseId: string;
  user: { fullName: string; avatar?: string };
  isPrivate: boolean;
}

export interface MockCourse {
  id: string;
  title: string;
  topics: MockTopic[];
  properties?: Record<string, unknown>;
}

export interface MockTopic {
  id: string;
  title: string;
  units: MockUnit[];
  los: MockLearningObject[];
}

export interface MockUnit {
  id: string;
  title: string;
  los: MockLearningObject[];
}

export interface MockLearningObject {
  type: string;
  title: string;
  route: string;
  img?: string;
  icon?: string;
  summary?: string;
  parent?: MockTopic | MockUnit;
}

export class TestWorld {
  fixtures: TestDataFactory;
  course: MockCourse | null = null;
  response: { title?: string; error?: string; status?: number } | null = null;
  presenceEvents: PresenceEvent[] = [];
  onlineStudents: Map<string, PresenceEvent> = new Map();
  coursesOnline: Map<string, PresenceEvent[]> = new Map();
  calendarData: Array<{ studentid: string; timeactive: number; id: string; courseid?: string; pageloads?: number }> = [];
  labData: Array<{ student_id: string; lo_id: string; duration: number }> = [];
  authenticated: boolean = false;
  currentUser: { id: string; name: string; avatar: string } | null = null;
  error: Error | null = null;

  constructor() {
    this.fixtures = new TestDataFactory();
  }

  reset(): void {
    this.course = null;
    this.response = null;
    this.presenceEvents = [];
    this.onlineStudents = new Map();
    this.coursesOnline = new Map();
    this.calendarData = [];
    this.labData = [];
    this.authenticated = false;
    this.currentUser = null;
    this.error = null;
  }
}
