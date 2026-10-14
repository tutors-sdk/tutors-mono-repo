/**
 * In-memory adapters for every port: what tests and the anonymous reader run against. Each one
 * keeps its state in plain collections and behaves as the contract suites say a real adapter must.
 */
import type { Course, Lo } from "@tutors/domain/course";
import type { ContentLock } from "@tutors/domain/access";
import type { LearningEvent, CalendarEntry, LearningRecord, TutorsConnectUser } from "@tutors/domain/learning";
import type { CourseVisit, PresenceEvent, Sentiment, StoredPresence } from "@tutors/domain/presence";
import { CourseNotFoundError, type CourseLocation, type CourseSource } from "../ports/course-source.ts";
import type { CourseEmitter } from "../ports/course-emitter.ts";
import type { ContentRenderer } from "../ports/content-renderer.ts";
import type { LearningEventSink } from "../ports/learning-event-sink.ts";
import type { LearningRecords } from "../ports/learning-records.ts";
import type { PresencePort, Unsubscribe } from "../ports/presence.ts";
import type { LearnerProfile, ProfilePort } from "../ports/profile.ts";
import type { IdentityClient, SessionPort } from "../ports/session.ts";
import type { AccessStore } from "../ports/access-store.ts";
import type { AppEvent, EventPublisher } from "../ports/event-publisher.ts";
import type { Clock } from "../ports/clock.ts";
import type { AssignmentSource, MoodleAssignSubmissionsResponse, MoodleCourseSection } from "../ports/assignment-source.ts";
import type { Actor } from "@tutors/domain/access";

/** A clock stopped at one instant; `advance` moves it. */
export class FixedClock implements Clock {
  constructor(private at: number = Date.parse("2026-01-05T09:00:00.000Z")) {}
  now(): Date {
    return new Date(this.at);
  }
  nowMs(): number {
    return this.at;
  }
  advance(ms: number): void {
    this.at += ms;
  }
  set(iso: string): void {
    this.at = Date.parse(iso);
  }
}

/** Serves the tutors.json texts it was given, keyed by course id. */
export class InMemoryCourseSource implements CourseSource {
  readonly loads: CourseLocation[] = [];
  constructor(private readonly courses: Record<string, string | object> = {}) {}
  add(courseId: string, course: string | object): void {
    this.courses[courseId] = course;
  }
  async load(location: CourseLocation): Promise<string> {
    this.loads.push(location);
    const course = this.courses[location.courseId];
    if (course === undefined) throw new CourseNotFoundError(location.courseId, location.courseUrl);
    return typeof course === "string" ? course : JSON.stringify(course);
  }
}

/** Remembers what was emitted where. */
export class InMemoryCourseEmitter implements CourseEmitter {
  readonly emitted: Array<{ course: Course; destination: string }> = [];
  async emit(course: Course, destination: string): Promise<void> {
    this.emitted.push({ course, destination });
  }
}

/** Wraps markdown in a paragraph: enough to see that rendering happened and where. */
export class PassThroughRenderer implements ContentRenderer {
  mathLoads = 0;
  renderLo(_course: Course, lo: Lo): void {
    if (lo.contentMd) lo.contentHtml = this.renderMarkdown(lo.contentMd);
    this.renderSummary(lo);
  }
  renderSummary(lo: Lo): void {
    if (lo.summary) lo.summary = this.renderMarkdown(lo.summary);
  }
  renderMarkdown(md: string): string {
    return `<p>${md}</p>`;
  }
  mayContainMath(text: string): boolean {
    return text.includes("$");
  }
  async loadMath(): Promise<void> {
    this.mathLoads++;
  }
}

/** Keeps every learning event it is given, in order. */
export class InMemoryLearningEventSink implements LearningEventSink {
  readonly recorded: Array<{ event: LearningEvent; learnerId: string }> = [];
  async record(event: LearningEvent, learnerId: string): Promise<void> {
    this.recorded.push({ event, learnerId });
  }
}

/** Answers from the rows it was given. */
export class InMemoryLearningRecords implements LearningRecords {
  constructor(
    private readonly calendar: CalendarEntry[] = [],
    private readonly records: LearningRecord[] = [],
    private readonly users: TutorsConnectUser[] = []
  ) {}
  async calendarEntries(courseId: string, start?: string | null, end?: string | null): Promise<CalendarEntry[]> {
    return this.calendar.filter((e) => e.courseid === courseId && (!start || e.id >= start) && (!end || e.id <= end));
  }
  async learningRecords(courseId: string, learnerId?: string): Promise<LearningRecord[]> {
    return this.records.filter((r) => r.course_id === courseId && (!learnerId || r.student_id === learnerId));
  }
  async learners(courseId: string): Promise<TutorsConnectUser[]> {
    const ids = new Set(this.records.filter((r) => r.course_id === courseId).map((r) => r.student_id));
    return this.users.filter((u) => ids.has(u.github_id));
  }
}

/** Delivers presence events to subscribers in the same process and keeps the latest snapshot per learner per course. */
export class InMemoryPresence implements PresencePort {
  readonly published: PresenceEvent[] = [];
  private readonly latest = new Map<string, { event: PresenceEvent; receivedAt: string }>();
  private readonly listeners = new Set<{ listener: (event: PresenceEvent) => void; courseId?: string }>();
  constructor(private readonly clock: Clock = new FixedClock()) {}
  async publish(event: PresenceEvent): Promise<void> {
    this.published.push(event);
    const id = event.user?.id;
    if (id) this.latest.set(`${event.courseId}\t${id}`, { event, receivedAt: this.clock.now().toISOString() });
    for (const { listener, courseId } of this.listeners) {
      if (!courseId || courseId === event.courseId) listener(event);
    }
  }
  subscribe(listener: (event: PresenceEvent) => void, courseId?: string): Unsubscribe {
    const entry = { listener, courseId };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }
  async recent(courseId: string, sinceIso: string): Promise<StoredPresence[] | null> {
    return [...this.latest.entries()]
      .filter(([key, { receivedAt }]) => key.startsWith(`${courseId}\t`) && receivedAt >= sinceIso)
      .sort((a, b) => (a[1].receivedAt < b[1].receivedAt ? 1 : -1))
      .map(([, { event }]) => ({ payload: event }));
  }
}

/** One learner record per login, in memory. */
export class InMemoryProfile implements ProfilePort {
  readonly visits = new Map<string, CourseVisit[]>();
  readonly learners = new Map<string, LearnerProfile>();
  readonly sentiments = new Map<string, Sentiment>();
  readonly sharing = new Map<string, boolean>();
  async getCourseVisits(learnerId: string): Promise<CourseVisit[]> {
    return structuredClone(this.visits.get(learnerId) ?? []);
  }
  async saveCourseVisits(learnerId: string, visits: CourseVisit[]): Promise<void> {
    this.visits.set(learnerId, structuredClone(visits));
  }
  async upsertLearner(profile: LearnerProfile): Promise<void> {
    this.learners.set(profile.login, { ...profile });
    if (profile.sharing !== null) this.sharing.set(profile.login, profile.sharing);
  }
  async getSentiment(learnerId: string): Promise<Sentiment | null> {
    return this.sentiments.get(learnerId) ?? null;
  }
  async setSentiment(learnerId: string, sentiment: Sentiment): Promise<void> {
    this.sentiments.set(learnerId, sentiment);
  }
  async getSharing(learnerId: string): Promise<boolean | null> {
    return this.sharing.get(learnerId) ?? null;
  }
  async setSharing(learnerId: string, sharing: boolean): Promise<void> {
    this.sharing.set(learnerId, sharing);
  }
}

/** A session for one fixed actor, or for nobody. */
export class FixedSession implements SessionPort {
  constructor(private readonly actor: Actor | null = null) {}
  async getActor(): Promise<Actor | null> {
    return this.actor;
  }
}

/** Remembers the sign-ins and sign-outs asked for. */
export class RecordingIdentityClient implements IdentityClient {
  readonly signIns: string[] = [];
  readonly signOuts: string[] = [];
  async signIn(returnTo: string): Promise<void> {
    this.signIns.push(returnTo);
  }
  async signOut(returnTo: string): Promise<void> {
    this.signOuts.push(returnTo);
  }
}

/** Content locks per course, in memory. */
export class InMemoryAccessStore implements AccessStore {
  private readonly rows = new Map<string, ContentLock>();
  constructor(private readonly clock: Clock = new FixedClock()) {}
  async locks(courseId: string): Promise<ContentLock[]> {
    return [...this.rows.values()].filter((lock) => lock.course_id === courseId).map((lock) => ({ ...lock }));
  }
  async setLock(courseId: string, loRoute: string, locked: boolean, lockedBy: string): Promise<boolean> {
    if (!courseId || !loRoute || !lockedBy) return false;
    this.rows.set(`${courseId}\t${loRoute}`, { course_id: courseId, lo_route: loRoute, locked, locked_by: lockedBy, locked_at: this.clock.now().toISOString() });
    return true;
  }
  async removeLock(courseId: string, loRoute: string): Promise<boolean> {
    if (!courseId || !loRoute) return false;
    return this.rows.delete(`${courseId}\t${loRoute}`);
  }
}

/** Delivers application events to subscribers in the same process, and keeps them for assertions. */
export class RecordingPublisher implements EventPublisher {
  readonly events: AppEvent[] = [];
  private readonly listeners = new Set<(event: AppEvent) => void>();
  async publish(event: AppEvent): Promise<void> {
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }
  subscribe(listener: (event: AppEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Answers from the sections and submissions it was given. */
export class InMemoryAssignmentSource implements AssignmentSource {
  constructor(
    private readonly sections: Record<number, MoodleCourseSection[]> = {},
    private readonly submissions: MoodleAssignSubmissionsResponse = { assignments: [] }
  ) {}
  async courseContents(courseId: number): Promise<MoodleCourseSection[]> {
    return this.sections[courseId] ?? [];
  }
  async assignmentSubmissions(assignmentIds: number[]): Promise<MoodleAssignSubmissionsResponse> {
    return { assignments: this.submissions.assignments.filter((a) => assignmentIds.includes(a.assignmentid)) };
  }
}
