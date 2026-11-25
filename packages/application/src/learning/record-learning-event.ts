import { pageLoadEvent, tickEvent } from "@tutors/domain/learning";
import type { Course, Lo } from "@tutors/domain/course";
import type { Clock } from "../ports/clock.ts";
import type { EventPublisher } from "../ports/event-publisher.ts";
import type { LearningEventSink } from "../ports/learning-event-sink.ts";

export type RecordLearningDeps = {
  events: LearningEventSink;
  clock: Clock;
  publish?: EventPublisher["publish"];
};

/** The learner a learning event is recorded for; nothing is recorded without one. */
export type Learner = { login: string } | null | undefined;

/**
 * A learner opened a learning object: record the page load and tell the rest of the application.
 * Nothing is recorded for a visitor who is not signed in.
 */
export const recordLearningEvent = ({ events, clock, publish }: RecordLearningDeps) =>
  async (learner: Learner, course: Course, lo: Lo, stepId?: string): Promise<void> => {
    if (!learner?.login) return;
    const event = pageLoadEvent(course, lo, clock.now(), stepId);
    await events.record(event, learner.login);
    await publish?.({ type: "learning", learnerId: learner.login, event });
  };

/** The 30-second "still reading" tick: records time against the learning object on screen, and the day. */
export const recordHeartbeat = ({ events, clock, publish }: RecordLearningDeps) =>
  async (learner: Learner, course: Course, lo: Lo | null, stepId?: string): Promise<void> => {
    if (!learner?.login) return;
    const event = tickEvent(course, lo, clock.now(), stepId);
    await events.record(event, learner.login);
    await publish?.({ type: "learning", learnerId: learner.login, event });
  };
