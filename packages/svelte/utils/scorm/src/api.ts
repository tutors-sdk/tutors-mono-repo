/**
 * The SCORM run-time API — the object a SCO finds by walking up `window.parent`.
 *
 * SCORM 1.2 and 2004 define the same eight operations under different names, so the
 * behaviour lives in one place and the two profiles are thin adapters over it. Every
 * method returns a string or `"true"`/`"false"`, never a real boolean, because that is
 * what the specification requires and what content checks for.
 */

import { CmiModel, SCORM_ERROR } from "./model.ts";
import { formatDuration, parseDuration } from "./time.ts";
import type { ScormApiOptions, ScormSummary } from "./types.ts";

const ERROR_STRINGS: Record<string, string> = {
  "0": "No error",
  "101": "General exception",
  "122": "Retrieve data before initialization",
  "132": "Store data before initialization",
  "301": "Not initialized",
  "403": "Element is read only",
  "404": "Element is write only",
};

/** Profile-specific element names for the values Tutors itself reads. */
interface Bindings {
  learnerId: string;
  learnerName: string;
  completionStatus: string;
  successStatus: string;
  location: string;
  sessionTime: string;
  totalTime: string;
  exit: string;
  entry: string;
  scoreRaw: string;
  scoreMin: string;
  scoreMax: string;
  scoreScaled?: string;
  masteryScore?: string;
}

const BINDINGS_12: Bindings = {
  learnerId: "cmi.core.student_id",
  learnerName: "cmi.core.student_name",
  completionStatus: "cmi.core.lesson_status",
  // 1.2 folds pass/fail and complete/incomplete into a single element.
  successStatus: "cmi.core.lesson_status",
  location: "cmi.core.lesson_location",
  sessionTime: "cmi.core.session_time",
  totalTime: "cmi.core.total_time",
  exit: "cmi.core.exit",
  entry: "cmi.core.entry",
  scoreRaw: "cmi.core.score.raw",
  scoreMin: "cmi.core.score.min",
  scoreMax: "cmi.core.score.max",
  masteryScore: "cmi.student_data.mastery_score",
};

const BINDINGS_2004: Bindings = {
  learnerId: "cmi.learner_id",
  learnerName: "cmi.learner_name",
  completionStatus: "cmi.completion_status",
  successStatus: "cmi.success_status",
  location: "cmi.location",
  sessionTime: "cmi.session_time",
  totalTime: "cmi.total_time",
  exit: "cmi.exit",
  entry: "cmi.entry",
  scoreRaw: "cmi.score.raw",
  scoreMin: "cmi.score.min",
  scoreMax: "cmi.score.max",
  scoreScaled: "cmi.score.scaled",
  masteryScore: "cmi.scaled_passing_score",
};

function toNumber(value: string): number | undefined {
  if (value === "") return undefined;
  const parsed = Number(value);
  return isNaN(parsed) ? undefined : parsed;
}

/** Profile-independent implementation of the run-time. */
export class ScormRuntime {
  private readonly options: ScormApiOptions;
  private readonly bindings: Bindings;
  private readonly model: CmiModel;
  /** Time carried over from previous attempts; the current session is added on top. */
  private readonly baseTotalSeconds: number;
  private initialised = false;
  private terminated = false;
  private lastError: string = SCORM_ERROR.none;

  constructor(options: ScormApiOptions) {
    this.options = options;
    this.bindings = options.version === "2004" ? BINDINGS_2004 : BINDINGS_12;
    const previous = options.store.load();
    this.model = new CmiModel(options.version, previous);
    this.baseTotalSeconds = parseDuration(previous[this.bindings.totalTime] || "", options.version);

    this.model.seed(this.bindings.learnerId, options.learnerId);
    this.model.seed(this.bindings.learnerName, options.learnerName);
    if (options.masteryScore !== undefined && this.bindings.masteryScore) {
      this.model.seed(this.bindings.masteryScore, String(options.masteryScore));
    }
    // A SCO decides whether to resume or restart from cmi.entry, so it has to reflect
    // whether the previous attempt was suspended rather than finished.
    const resuming = previous[this.bindings.exit] === "suspend" || Boolean(previous[this.bindings.location]);
    this.model.seed(this.bindings.entry, resuming ? "resume" : "ab-initio");
  }

  private fail(code: string): "false" {
    this.lastError = code;
    return "false";
  }

  private succeed(): "true" {
    this.lastError = SCORM_ERROR.none;
    return "true";
  }

  initialize(): "true" | "false" {
    if (this.initialised) return this.fail(SCORM_ERROR.generalException);
    this.initialised = true;
    return this.succeed();
  }

  terminate(): "true" | "false" {
    if (!this.initialised || this.terminated) return this.fail(SCORM_ERROR.notInitialised);
    this.terminated = true;
    this.persist();
    return this.succeed();
  }

  getValue(element: string): string {
    if (!this.initialised || this.terminated) {
      this.lastError = SCORM_ERROR.getBeforeInitialise;
      return "";
    }
    const { value, error } = this.model.get(element);
    this.lastError = error;
    return value;
  }

  setValue(element: string, value: string): "true" | "false" {
    if (!this.initialised || this.terminated) return this.fail(SCORM_ERROR.setBeforeInitialise);
    const error = this.model.set(element, String(value));
    return error === SCORM_ERROR.none ? this.succeed() : this.fail(error);
  }

  commit(): "true" | "false" {
    if (!this.initialised || this.terminated) return this.fail(SCORM_ERROR.notInitialised);
    this.persist();
    return this.succeed();
  }

  getLastError(): string {
    return this.lastError;
  }

  getErrorString(code: string): string {
    return ERROR_STRINGS[code] ?? "";
  }

  getDiagnostic(code: string): string {
    return this.getErrorString(code);
  }

  /**
   * Elapsed time across every attempt.
   *
   * `total_time` as the SCO sees it deliberately excludes the current session — the
   * specification says the LMS adds it on termination — so the running total is derived
   * rather than stored, and only written out when persisting.
   */
  private totalSeconds(): number {
    return this.baseTotalSeconds + parseDuration(this.model.peek(this.bindings.sessionTime), this.options.version);
  }

  summary(): ScormSummary {
    const status = this.model.get(this.bindings.completionStatus).value;
    const success = this.model.get(this.bindings.successStatus).value;
    return {
      completionStatus: status || "unknown",
      successStatus: success || "unknown",
      scoreRaw: toNumber(this.model.get(this.bindings.scoreRaw).value),
      scoreMin: toNumber(this.model.get(this.bindings.scoreMin).value),
      scoreMax: toNumber(this.model.get(this.bindings.scoreMax).value),
      scoreScaled: this.bindings.scoreScaled ? toNumber(this.model.get(this.bindings.scoreScaled).value) : undefined,
      totalTime: this.totalSeconds(),
      location: this.model.get(this.bindings.location).value,
    };
  }

  private persist(): void {
    const cmi = this.model.snapshot();
    cmi[this.bindings.totalTime] = formatDuration(this.totalSeconds(), this.options.version);
    try {
      this.options.store.save(cmi, this.summary());
    } catch (error) {
      // A failed save must not propagate into the SCO, which would read it as an API fault.
      console.error("[tutors-scorm] could not save SCORM state", error);
    }
  }
}

/** Object shape a SCORM 1.2 SCO expects to find. */
export interface Scorm12Api {
  LMSInitialize(_: string): string;
  LMSFinish(_: string): string;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): string;
  LMSCommit(_: string): string;
  LMSGetLastError(): string;
  LMSGetErrorString(code: string): string;
  LMSGetDiagnostic(code: string): string;
}

/** Object shape a SCORM 2004 SCO expects to find. */
export interface Scorm2004Api {
  Initialize(_: string): string;
  Terminate(_: string): string;
  GetValue(element: string): string;
  SetValue(element: string, value: string): string;
  Commit(_: string): string;
  GetLastError(): string;
  GetErrorString(code: string): string;
  GetDiagnostic(code: string): string;
}

export function createScorm12Api(runtime: ScormRuntime): Scorm12Api {
  return {
    LMSInitialize: () => runtime.initialize(),
    LMSFinish: () => runtime.terminate(),
    LMSGetValue: (element) => runtime.getValue(element),
    LMSSetValue: (element, value) => runtime.setValue(element, value),
    LMSCommit: () => runtime.commit(),
    LMSGetLastError: () => runtime.getLastError(),
    LMSGetErrorString: (code) => runtime.getErrorString(code),
    LMSGetDiagnostic: (code) => runtime.getDiagnostic(code),
  };
}

export function createScorm2004Api(runtime: ScormRuntime): Scorm2004Api {
  return {
    Initialize: () => runtime.initialize(),
    Terminate: () => runtime.terminate(),
    GetValue: (element) => runtime.getValue(element),
    SetValue: (element, value) => runtime.setValue(element, value),
    Commit: () => runtime.commit(),
    GetLastError: () => runtime.getLastError(),
    GetErrorString: (code) => runtime.getErrorString(code),
    GetDiagnostic: (code) => runtime.getDiagnostic(code),
  };
}

/** Window properties a SCO searches for, by profile. */
const API_PROPERTY = { "1.2": "API", "2004": "API_1484_11" } as const;

/**
 * Publish the API where a framed SCO will find it.
 *
 * It has to be installed before the iframe is created: content conventionally searches
 * for the API during its own load, and a SCO that finds nothing gives up and shows an
 * "LMS not found" error rather than retrying.
 *
 * @returns a function that removes the API again, for component teardown
 */
export function installScormApi(target: Window, options: ScormApiOptions): { runtime: ScormRuntime; uninstall: () => void } {
  const runtime = new ScormRuntime(options);
  const property = API_PROPERTY[options.version];
  const api = options.version === "2004" ? createScorm2004Api(runtime) : createScorm12Api(runtime);
  (target as unknown as Record<string, unknown>)[property] = api;
  return {
    runtime,
    uninstall: () => {
      delete (target as unknown as Record<string, unknown>)[property];
    },
  };
}
