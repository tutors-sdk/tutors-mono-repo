/**
 * The driven adapters this state adapter calls the use cases with. Each app's composition root
 * installs them with `configureAdapters` before anything else runs; until then, and in the
 * anonymous reader, the in-memory set is in place: nothing is recorded, nobody is present, sign-in
 * does not exist. No service in this package reads the environment; that is the root's job.
 */
import type {
  AccessStore,
  Clock,
  ContentRenderer,
  CourseSource,
  EventPublisher,
  IdentityClient,
  LearningEventSink,
  PresencePort,
  ProfilePort
} from "@tutors/application/ports";
import {
  InMemoryAccessStore,
  InMemoryCourseSource,
  InMemoryLearningEventSink,
  InMemoryPresence,
  InMemoryProfile,
  PassThroughRenderer,
  RecordingPublisher
} from "@tutors/application/testing";

export type Adapters = {
  /** True when the app runs with no learner record at all: nothing recorded, nobody present, no sign-in. */
  anonymous: boolean;
  clock: Clock;
  renderer: ContentRenderer;
  courseSource: CourseSource;
  learningEvents: LearningEventSink;
  presence: PresencePort;
  /** The learner's record before they sign in (the browser's), and once they have (the store's). */
  profile: { local: ProfilePort; signedIn: ProfilePort | null };
  accessStore: AccessStore;
  publisher: EventPublisher;
  identityClient: IdentityClient | null;
  /**
   * The whiteboard's own persistence client, until it has a port of its own. Typed as unknown
   * here so this package names no vendor; the whiteboard component casts it.
   */
  whiteboardClient: unknown;
};

const systemClock: Clock = { now: () => new Date(), nowMs: () => Date.now() };

/** The set for a reader with nobody to record: what `PUBLIC_ANON_MODE` composes, and what tests start from. */
export function anonymousAdapters(overrides: Partial<Adapters> = {}): Adapters {
  const profile = new InMemoryProfile();
  return {
    anonymous: true,
    clock: systemClock,
    renderer: new PassThroughRenderer(),
    courseSource: new InMemoryCourseSource(),
    learningEvents: new InMemoryLearningEventSink(),
    presence: new InMemoryPresence(systemClock),
    profile: { local: profile, signedIn: null },
    accessStore: new InMemoryAccessStore(systemClock),
    publisher: new RecordingPublisher(),
    identityClient: null,
    whiteboardClient: undefined,
    ...overrides
  };
}

let current: Adapters = anonymousAdapters();

/** Install the adapters; anything left out keeps its current value. */
export function configureAdapters(adapters: Partial<Adapters>): Adapters {
  current = { ...current, ...adapters };
  return current;
}

export function adapters(): Adapters {
  return current;
}
