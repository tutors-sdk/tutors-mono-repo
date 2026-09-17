/**
 * The Tutors Live event contract.
 *
 * Everything that publishes or consumes a live event - the reader, the ingest
 * consumer, the read API - agrees here and nowhere else, so a change to the
 * shape of an event is a change to one file.
 *
 * @module
 */

export { SERVICES, isService, serviceForLoType, type Service } from "./catalogue.ts";
export {
  EVENT_TYPES,
  SUBJECT_WILDCARD,
  subjectFor,
  type CourseOpened,
  type LiveEvent,
  type LiveEventType,
  type LoViewed,
  type ServiceUsed,
  type SessionEnded,
  type SessionHeartbeat,
  type SessionStarted
} from "./events.ts";
export { MAX_BATCH_SIZE, MAX_FIELD_LENGTH, coarsenToMinute, parseLiveEvent, parseLiveEvents, type Rejection } from "./validate.ts";
export { SID_STORAGE_KEY, browserStorage, currentSid, dayKey, newSid, opaqueUid, sidDay, type SidStorage } from "./session.ts";
export { createLiveEmitter, startEmitterLifecycle, type EmitterOptions, type LiveEmitter } from "./emitter.ts";
