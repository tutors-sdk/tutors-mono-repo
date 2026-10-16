/**
 * Lecturer feedback on lab steps (Rules 0400-0409, 0564, 0565, 0567, 0570): annotations for one
 * student or for everyone on a step, revocation and history. Pages use the service
 * (`@tutors/feedback/service`); the reader's server uses `@tutors/feedback/server`.
 */
export * from "./annotation.ts";
export { memoryFeedbackStore, RECEIVED_LIMIT, type FeedbackStore } from "./store.ts";
export { FeedbackReadError, readerFeedbackDesk, type FeedbackDesk, type FeedbackRefusal, type FeedbackResult, type StepFeedbackView } from "./client.ts";
