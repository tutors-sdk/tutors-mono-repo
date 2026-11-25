import type { CourseVisit, Sentiment } from "@tutors/domain/presence";

/** What Tutors keeps about a signed-in learner, beyond their identity. */
export type LearnerProfile = {
  login: string;
  name: string | null;
  email: string | null;
  image: string | null;
  sentiment: string | null;
  /** True when they share their presence, false when not, null when not stated. */
  sharing: boolean | null;
};

/** Reads and changes a learner's record: their course-visit history, sentiment and sharing. */
export interface ProfilePort {
  getCourseVisits(learnerId: string): Promise<CourseVisit[]>;
  saveCourseVisits(learnerId: string, visits: CourseVisit[]): Promise<void>;
  /** Create or refresh the learner's record from their identity. */
  upsertLearner(profile: LearnerProfile): Promise<void>;
  getSentiment(learnerId: string): Promise<Sentiment | null>;
  setSentiment(learnerId: string, sentiment: Sentiment): Promise<void>;
  getSharing(learnerId: string): Promise<boolean | null>;
  setSharing(learnerId: string, sharing: boolean): Promise<void>;
}
