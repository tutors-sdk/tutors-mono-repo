/**
 * What the help-request use cases need from outside: somewhere to keep requests, a way to tell
 * the course's watchers one changed, and the time. The reader's server hands in the Supabase store
 * and feed (supabase.ts); the tests hand in in-memory ones.
 */
import type { HelpRequest, NewHelpRequest } from "./help-request.ts";

/**
 * Help requests, wherever an adapter keeps them. Writes are compare-and-set on the request as it was
 * read (its state, kind and step) so a request moves to each state once even when two lecturers
 * press at the same moment (Rule 0389), and a lecturer acting on a stale read never undoes the
 * student asking again on another step or kind.
 */
export interface AssistanceStore {
  /**
   * Keeps a new request and resolves it with its id; rejects when it could not be kept. The table
   * refuses a second live request for the same learner and course (a unique index), so two opens
   * racing each other cannot both succeed.
   */
  open(request: NewHelpRequest): Promise<HelpRequest>;
  /** One request by id, or null. */
  get(id: string): Promise<HelpRequest | null>;
  /** The course's open and acknowledged requests, in no particular order. */
  live(courseId: string): Promise<HelpRequest[]>;
  /**
   * Replaces every field of a request with `next` only while the stored request still has `prior`'s
   * state, kind and step; resolves false, writing nothing, when it is missing or has changed since.
   */
  replace(next: HelpRequest, prior: HelpRequest): Promise<boolean>;
}

/** Tells whoever watches a course's help queue that a request changed (Rule 0391). */
export interface AssistanceFeed {
  /** Resolves false when nothing was sent. */
  publish(request: HelpRequest): Promise<boolean>;
}

export interface Clock {
  now(): Date;
  nowMs(): number;
}
