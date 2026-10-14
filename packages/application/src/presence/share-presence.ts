import type { Course, Lo } from "@tutors/domain/course";
import { presenceEvent, presentLearners, rosterSince, type LearnerDisplay, type PresenceEvent } from "@tutors/domain/presence";
import type { Clock } from "../ports/clock.ts";
import type { EventPublisher } from "../ports/event-publisher.ts";
import type { PresencePort } from "../ports/presence.ts";

export type SharePresenceDeps = { presence: PresencePort; publish?: EventPublisher["publish"] };

/** A sharing learner moved to a learning object: tell the live views and keep it as their latest snapshot. */
export const sharePresence = ({ presence, publish }: SharePresenceDeps) =>
  async (course: Course, lo: Lo, user: LearnerDisplay): Promise<PresenceEvent> => {
    const event = presenceEvent(course, lo, user);
    await presence.publish(event);
    await publish?.({ type: "presence", event });
    return event;
  };

export type CourseRosterDeps = { presence: PresencePort; clock: Clock };

/**
 * Who is in a course now, from stored activity: null when the read failed, so the caller keeps
 * the list it has rather than emptying it.
 */
export const courseRoster = ({ presence, clock }: CourseRosterDeps) =>
  async (courseId: string): Promise<Map<string, PresenceEvent> | null> => {
    const rows = await presence.recent(courseId, rosterSince(clock.nowMs()));
    if (!rows) return null;
    return presentLearners(rows, courseId);
  };
