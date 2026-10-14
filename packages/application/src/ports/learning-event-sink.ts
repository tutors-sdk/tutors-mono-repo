import type { LearningEvent } from "@tutors/domain/learning";

/** Records time and page loads for the signed-in learner. */
export interface LearningEventSink {
  record(event: LearningEvent, learnerId: string): Promise<void>;
}
