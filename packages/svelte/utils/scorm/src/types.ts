/**
 * Shared types for the SCORM run-time environment.
 */

/** SCORM specification versions Tutors can host. */
export type ScormVersion = "1.2" | "2004";

/**
 * The part of a SCO's state that Tutors cares about.
 *
 * The full CMI model is round-tripped verbatim so the SCO resumes exactly as it left off,
 * but only these fields are meaningful to Tutors itself — they are what a report or a
 * gradebook is built from.
 */
export interface ScormSummary {
  /** "completed", "incomplete", "not attempted" or "unknown". */
  completionStatus: string;
  /** "passed", "failed" or "unknown". */
  successStatus: string;
  scoreRaw?: number;
  scoreMin?: number;
  scoreMax?: number;
  /** 0..1, SCORM 2004 only. */
  scoreScaled?: number;
  /** Accumulated seconds across every session. */
  totalTime: number;
  /** The SCO's own bookmark, replayed to it on resume. */
  location: string;
}

/**
 * Where a learner's SCORM state lives between sessions.
 *
 * Implementations decide whether that is a database row or the browser; the run-time
 * neither knows nor cares. `save` is fire-and-forget because it is called from the SCO's
 * synchronous Commit and Terminate, which cannot wait for a round trip.
 */
export interface ScormStore {
  /** Previously saved CMI data, or an empty object for a first attempt. */
  load(): Record<string, string>;
  save(cmi: Record<string, string>, summary: ScormSummary): void;
}

export interface ScormApiOptions {
  version: ScormVersion;
  /** Reported to the SCO as `cmi.core.student_id` / `cmi.learner_id`. */
  learnerId: string;
  /** Reported to the SCO as `cmi.core.student_name` / `cmi.learner_name`. */
  learnerName: string;
  /** Pass mark declared by the learning object, if any. */
  masteryScore?: number;
  store: ScormStore;
}
