/**
 * The CMI data model — the key/value store a SCO reads and writes through the API.
 *
 * Tutors is deliberately a permissive LMS here. The specification defines a large
 * vocabulary with per-element types, ranges and access rules, but enforcing all of it
 * buys nothing for a learner: a SCO that writes an element Tutors has never heard of
 * should still run and still resume. So unknown elements are stored and returned as
 * written, and only the access rules that content actually relies on — read-only
 * identity fields, write-only session fields, and derived `_count`/`_children` — are
 * implemented.
 */

import type { ScormVersion } from "./types.ts";

export const SCORM_ERROR = {
  none: "0",
  generalException: "101",
  notInitialised: "301",
  getBeforeInitialise: "122",
  setBeforeInitialise: "132",
  readOnly: "403",
  writeOnly: "404",
} as const;

const DEFAULTS_12: Record<string, string> = {
  "cmi.core.lesson_status": "not attempted",
  "cmi.core.entry": "ab-initio",
  "cmi.core.credit": "credit",
  "cmi.core.lesson_mode": "normal",
  "cmi.core.lesson_location": "",
  "cmi.core.score.raw": "",
  "cmi.core.score.min": "",
  "cmi.core.score.max": "",
  "cmi.core.total_time": "00:00:00.00",
  "cmi.suspend_data": "",
  "cmi.launch_data": "",
  "cmi.comments": "",
  "cmi.comments_from_lms": "",
  "cmi.student_data.mastery_score": "",
  "cmi.student_data.max_time_allowed": "",
  "cmi.student_data.time_limit_action": "",
  "cmi.student_preference.audio": "0",
  "cmi.student_preference.language": "",
  "cmi.student_preference.speed": "0",
  "cmi.student_preference.text": "0",
};

const DEFAULTS_2004: Record<string, string> = {
  "cmi.completion_status": "unknown",
  "cmi.success_status": "unknown",
  "cmi.entry": "ab-initio",
  "cmi.credit": "credit",
  "cmi.mode": "normal",
  "cmi.location": "",
  "cmi.progress_measure": "",
  "cmi.score.raw": "",
  "cmi.score.min": "",
  "cmi.score.max": "",
  "cmi.score.scaled": "",
  "cmi.total_time": "PT0S",
  "cmi.suspend_data": "",
  "cmi.launch_data": "",
  "cmi.max_time_allowed": "",
  "cmi.time_limit_action": "continue,no message",
  "cmi.scaled_passing_score": "",
  "cmi.completion_threshold": "",
  "cmi.learner_preference.audio_level": "1",
  "cmi.learner_preference.language": "",
  "cmi.learner_preference.delivery_speed": "1",
  "cmi.learner_preference.audio_captioning": "0",
};

const READ_ONLY_12 = new Set([
  "cmi.core.student_id",
  "cmi.core.student_name",
  "cmi.core.credit",
  "cmi.core.entry",
  "cmi.core.total_time",
  "cmi.core.lesson_mode",
  "cmi.launch_data",
  "cmi.comments_from_lms",
  "cmi.student_data.mastery_score",
  "cmi.student_data.max_time_allowed",
  "cmi.student_data.time_limit_action",
]);

const READ_ONLY_2004 = new Set([
  "cmi.learner_id",
  "cmi.learner_name",
  "cmi.credit",
  "cmi.entry",
  "cmi.mode",
  "cmi.total_time",
  "cmi.launch_data",
  "cmi.max_time_allowed",
  "cmi.time_limit_action",
  "cmi.scaled_passing_score",
  "cmi.completion_threshold",
]);

const WRITE_ONLY_12 = new Set(["cmi.core.exit", "cmi.core.session_time"]);
const WRITE_ONLY_2004 = new Set(["cmi.exit", "cmi.session_time"]);

/**
 * `_children` lists, returned verbatim when a SCO asks what a collection supports.
 * Content uses these to decide which sub-elements are safe to write.
 */
const CHILDREN: Record<string, string> = {
  "cmi.core._children": "student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time",
  "cmi.core.score._children": "raw,min,max",
  "cmi.objectives._children": "id,score,status",
  "cmi.interactions._children": "id,objectives,time,type,correct_responses,weighting,student_response,result,latency",
  "cmi.student_data._children": "mastery_score,max_time_allowed,time_limit_action",
  "cmi.student_preference._children": "audio,language,speed,text",
  "cmi.score._children": "scaled,raw,min,max",
  "cmi.comments_from_learner._children": "comment,location,timestamp",
  "cmi.comments_from_lms._children": "comment,location,timestamp",
  "cmi.learner_preference._children": "audio_level,language,delivery_speed,audio_captioning",
};

export class CmiModel {
  private readonly data: Record<string, string>;
  private readonly readOnly: Set<string>;
  private readonly writeOnly: Set<string>;

  constructor(version: ScormVersion, initial: Record<string, string> = {}) {
    this.data = { ...(version === "2004" ? DEFAULTS_2004 : DEFAULTS_12), ...initial };
    this.readOnly = version === "2004" ? READ_ONLY_2004 : READ_ONLY_12;
    this.writeOnly = version === "2004" ? WRITE_ONLY_2004 : WRITE_ONLY_12;
  }

  /** Seed a value the SCO may only read, such as the learner's identity. */
  seed(element: string, value: string): void {
    this.data[element] = value;
  }

  /**
   * Read a value ignoring the SCO's access rules, as the LMS itself may.
   *
   * `session_time` is write-only to content, but the LMS has to read it back to roll it
   * into `total_time`, so going through `get` would silently see an empty string.
   */
  peek(element: string): string {
    return this.data[element] ?? "";
  }

  /**
   * Size of a collection, derived from the indices actually written.
   *
   * SCOs write `cmi.interactions.0.id`, `cmi.interactions.1.id` and so on, then read
   * `cmi.interactions._count` back; the count is a property of the data, not something
   * the SCO sets.
   */
  private countOf(prefix: string): string {
    // Matched by hand rather than by building a regex out of the element name. The name
    // comes from the content, so it can hold regex meta-characters, and escaping them all
    // correctly is the sort of thing that is quietly wrong for years.
    const start = `${prefix}.`;
    let highest = -1;
    for (const key of Object.keys(this.data)) {
      if (!key.startsWith(start)) continue;
      const rest = key.slice(start.length);
      const dot = rest.indexOf(".");
      if (dot <= 0) continue;
      const index = rest.slice(0, dot);
      if (!/^\d+$/.test(index)) continue;
      highest = Math.max(highest, Number(index));
    }
    return String(highest + 1);
  }

  get(element: string): { value: string; error: string } {
    if (element in CHILDREN) return { value: CHILDREN[element], error: SCORM_ERROR.none };
    if (element.endsWith("._count")) {
      return { value: this.countOf(element.slice(0, -"._count".length)), error: SCORM_ERROR.none };
    }
    if (this.writeOnly.has(element)) return { value: "", error: SCORM_ERROR.writeOnly };
    return { value: this.data[element] ?? "", error: SCORM_ERROR.none };
  }

  set(element: string, value: string): string {
    if (this.readOnly.has(element) || element.endsWith("._count") || element in CHILDREN) {
      return SCORM_ERROR.readOnly;
    }
    this.data[element] = value;
    return SCORM_ERROR.none;
  }

  /** A copy of everything written, for persistence. */
  snapshot(): Record<string, string> {
    return { ...this.data };
  }
}
