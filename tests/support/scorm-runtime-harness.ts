/**
 * Runs the generated SCORM export run-time against a fake LMS.
 *
 * `buildRuntimeScript` emits ES5 source rather than a module, because it has to run in
 * whatever browser an LMS supports. Asserting on that string would test spelling, not
 * behaviour, so the script is evaluated here against a stand-in `window` and a stand-in
 * API object, and the tests then drive it the way a learner would: visit a page, let the
 * clock run, close the tab.
 */

import { buildRuntimeScript, type ScormRuntimeOptions } from "../../packages/jsr/gen/src/scorm/runtime.ts";

/** The LMS side of the conversation: what the run-time wrote, and what it asked for. */
export interface FakeLms {
  cmi: Record<string, string>;
  initialised: boolean;
  terminated: boolean;
  commits: number;
}

export interface ScormExportHarness {
  lms: FakeLms;
  /** Stands in for `window.TutorsScorm`, as a content page would call it. */
  visit(index: number, path?: string): void;
  /** Advance the run-time's one-second heartbeat. */
  tick(seconds: number): void;
  /** The learner navigates away or closes the tab. */
  pagehide(): void;
  /** The wrapper page finishes parsing, so it can reopen a resume location. */
  domContentLoaded(): void;
  /** `src` of the wrapper's iframe, i.e. the page the learner is shown. */
  frameSrc(): string;
}

export interface HarnessOptions extends ScormRuntimeOptions {
  /** State the LMS already holds for this learner, e.g. from a suspended attempt. */
  initialCmi?: Record<string, string>;
  /** Learner has switched to another tab, so time should not accrue. */
  hidden?: boolean;
}

function createApi(lms: FakeLms, version: ScormRuntimeOptions["version"]) {
  const initialize = () => {
    lms.initialised = true;
    return "true";
  };
  const terminate = () => {
    lms.terminated = true;
    return "true";
  };
  const getValue = (element: string) => lms.cmi[element] ?? "";
  const setValue = (element: string, value: string) => {
    lms.cmi[element] = value;
    return "true";
  };
  const commit = () => {
    lms.commits += 1;
    return "true";
  };
  const lastError = () => "0";

  return version === "2004"
    ? { Initialize: initialize, Terminate: terminate, GetValue: getValue, SetValue: setValue, Commit: commit, GetLastError: lastError }
    : { LMSInitialize: initialize, LMSFinish: terminate, LMSGetValue: getValue, LMSSetValue: setValue, LMSCommit: commit, LMSGetLastError: lastError };
}

/**
 * Evaluate the generated run-time in a fake window and return handles for driving it.
 *
 * The generated script reaches everything through the `global` it is handed — `document`,
 * `setInterval`, `atob`/`btoa`, `addEventListener` — so a plain object is a sufficient
 * window, and no DOM environment is needed.
 */
export function launchScormRuntime(options: HarnessOptions): ScormExportHarness {
  const lms: FakeLms = { cmi: { ...(options.initialCmi ?? {}) }, initialised: false, terminated: false, commits: 0 };
  const listeners: Record<string, Array<() => void>> = {};
  const frame = { src: "", setAttribute: (name: string, value: string) => void (name === "src" && (frame.src = value)) };
  let heartbeat: (() => void) | null = null;

  const win: Record<string, unknown> = {
    document: {
      hidden: options.hidden ?? false,
      getElementById: (id: string) => (id === "tutors-scorm-frame" ? frame : null),
    },
    setInterval: (fn: () => void) => {
      heartbeat = fn;
      return 1;
    },
    addEventListener: (name: string, fn: () => void) => {
      (listeners[name] ??= []).push(fn);
    },
    // Node's base64 decoder silently drops invalid characters; a browser throws, and the
    // run-time relies on that to notice corrupt suspend_data.
    atob: (value: string) => {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("InvalidCharacterError");
      return Buffer.from(value, "base64").toString("binary");
    },
    btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
    // Silenced: the run-time warns on conditions several tests deliberately provoke.
    console: { warn: () => {} },
  };
  win.parent = win;
  win[options.version === "2004" ? "API_1484_11" : "API"] = createApi(lms, options.version);

  const fire = (name: string) => (listeners[name] ?? []).forEach((fn) => fn());

  new Function("window", buildRuntimeScript(options))(win);

  const tutorsScorm = win.TutorsScorm as { visit(index: number, path?: string): void };

  return {
    lms,
    visit: (index, path) => tutorsScorm.visit(index, path),
    tick: (seconds) => {
      for (let i = 0; i < seconds; i += 1) heartbeat?.();
    },
    pagehide: () => fire("pagehide"),
    domContentLoaded: () => fire("DOMContentLoaded"),
    frameSrc: () => frame.src,
  };
}
