/**
 * What Tutors records about a learner beyond their identity: sentiment, whether they share their
 * presence, and the courses they visited.
 *
 * Who the learner is (name, login, email, avatar, session) is left to the identity port proposed
 * in issue #416, so this file does not define a user or session type.
 */
import type { CourseIcon } from "./learning-objects.ts";

/** How a learner says they feel about a course. Same members, in order, as model-lib's `COURSE_SENTIMENT_IDS`. */
export const SENTIMENTS = ["neutral", "fine", "delighted", "confident", "overwhelmed", "confused", "drained"] as const;

export type Sentiment = (typeof SENTIMENTS)[number];

/** The sentiment a learner has before they choose one. */
export const DEFAULT_SENTIMENT: Sentiment = "neutral";

const SENTIMENT_SET: ReadonlySet<string> = new Set(SENTIMENTS);

/** True when `value` is one of the sentiments. */
export function isSentiment(value: unknown): value is Sentiment {
  return typeof value === "string" && SENTIMENT_SET.has(value);
}

/** A stored or submitted sentiment, trimmed and lower-cased, or null when it is not one of the sentiments. */
export function parseSentiment(value: unknown): Sentiment | null {
  if (typeof value !== "string") return null;
  const normalised = value.trim().toLowerCase();
  return isSentiment(normalised) ? normalised : null;
}

/** The `online_status` column of `tutors-connect-users`: whether a learner shares their presence. */
export const ONLINE_STATUSES = ["online", "offline"] as const;

export type OnlineStatus = (typeof ONLINE_STATUSES)[number];

/**
 * Whether a learner shares their presence, from any of the forms the setting is stored in today:
 * `true`/`false`, `"true"`/`"false"` (localStorage) or `"online"`/`"offline"` (tutors-connect-users).
 * Anything else, including a missing value, is null: the caller decides the default.
 */
export function parseSharing(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  switch (value.trim().toLowerCase()) {
    case "true":
    case "online":
      return true;
    case "false":
    case "offline":
      return false;
    default:
      return null;
  }
}

/** The `online_status` to store for a sharing setting. */
export function onlineStatusFor(sharing: boolean): OnlineStatus {
  return sharing ? "online" : "offline";
}

/**
 * How a learner appears to others in presence and live views: shown in full when they share,
 * anonymised when they do not. The plain-data form of community's `LoUser`.
 */
export type LearnerDisplay = {
  /** GitHub login when sharing, otherwise an anonymous per-browser id. */
  id: string;
  fullName: string;
  avatar: string;
  sentiment: Sentiment;
};

/** One course in a learner's visit history. The shape of connect's `CourseVisit`, with the shared icon type. */
export type CourseVisit = {
  /** Course id, the course site's subdomain. */
  id: string;
  title: string;
  img?: string;
  icon?: CourseIcon;
  /** ISO date-time of the latest visit. */
  lastVisit: string;
  credits: string;
  visits?: number;
  private?: boolean;
  favourite?: boolean;
};
