import { describe, it, expect } from "vitest";
import { buildLmsRuntimeScript, LMS_RUNTIME_FILE } from "../../../packages/jsr/gen/src/scorm/lms-runtime.ts";

/**
 * The static build's LMS run-time is generated ES5, so it is evaluated here against a
 * stand-in window and then driven exactly as an imported SCO would drive it.
 */

interface LmsHarness {
  api: Record<string, (...args: string[]) => string>;
  storage: Map<string, string>;
  pagehide(): void;
}

function launch(config: Record<string, unknown>, storage = new Map<string, string>(), denyStorage = false): LmsHarness {
  const listeners: Array<() => void> = [];
  const win: Record<string, unknown> = {
    TUTORS_SCORM: config,
    localStorage: denyStorage
      ? {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("SecurityError");
        },
      }
      : {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
      },
    addEventListener: (name: string, fn: () => void) => void (name === "pagehide" && listeners.push(fn)),
  };

  new Function("window", buildLmsRuntimeScript())(win);

  const api = (win.API ?? win.API_1484_11) as Record<string, (...args: string[]) => string>;
  return { api, storage, pagehide: () => listeners.forEach((fn) => fn()) };
}

/** A 1.2 harness with its session already open. */
function open12(config: Record<string, unknown> = {}, storage?: Map<string, string>) {
  const harness = launch({ version: "1.2", courseId: "smoke", loId: "/scorm/smoke/quiz", ...config }, storage);
  harness.api.LMSInitialize("");
  return harness;
}

/** A 2004 harness with its session already open. */
function open2004(config: Record<string, unknown> = {}, storage?: Map<string, string>) {
  const harness = launch({ version: "2004", courseId: "smoke", loId: "/scorm/smoke/quiz", ...config }, storage);
  harness.api.Initialize("");
  return harness;
}

describe("buildLmsRuntimeScript: the file itself", () => {
  it("is named so every page can reach it from the course root", () => {
    expect(LMS_RUNTIME_FILE).toBe("tutors-scorm-lms.js");
  });

  it("is valid ES5, with no syntax the target browsers would reject", () => {
    const script = buildLmsRuntimeScript();
    expect(() => new Function("window", script)).not.toThrow();
    expect(script).not.toMatch(/\b(let|const|=>)\b/);
  });
});

describe("buildLmsRuntimeScript: profile selection", () => {
  it("publishes only window.API for a 1.2 package", () => {
    const harness = launch({ version: "1.2" });
    expect(typeof harness.api.LMSInitialize).toBe("function");
    expect(harness.api.Initialize).toBeUndefined();
  });

  it("publishes only window.API_1484_11 for a 2004 package", () => {
    const harness = launch({ version: "2004" });
    expect(typeof harness.api.Initialize).toBe("function");
    expect(harness.api.LMSInitialize).toBeUndefined();
  });
});

describe("buildLmsRuntimeScript: the data model", () => {
  it("seeds the learner's identity from the page", () => {
    const harness = open12({ learnerId: "student-1", learnerName: "A Learner" });
    expect(harness.api.LMSGetValue("cmi.core.student_id")).toBe("student-1");
    expect(harness.api.LMSGetValue("cmi.core.student_name")).toBe("A Learner");
  });

  it("falls back to an anonymous learner when the page names none", () => {
    expect(open12().api.LMSGetValue("cmi.core.student_id")).toBe("anonymous");
  });

  it("passes a declared mastery score to the content", () => {
    expect(open12({ masteryScore: 80 }).api.LMSGetValue("cmi.student_data.mastery_score")).toBe("80");
    expect(open2004({ masteryScore: 0.8 }).api.GetValue("cmi.scaled_passing_score")).toBe("0.8");
  });

  it("leaves the mastery score unset when the learning object declares none", () => {
    expect(open12({ masteryScore: "" }).api.LMSGetValue("cmi.student_data.mastery_score")).toBe("");
  });

  it("refuses to let content overwrite a read-only element", () => {
    const harness = open12();
    expect(harness.api.LMSSetValue("cmi.core.student_id", "someone-else")).toBe("false");
    expect(harness.api.LMSGetLastError()).toBe("403");
    expect(harness.api.LMSGetValue("cmi.core.student_id")).toBe("anonymous");
  });

  it("refuses to let content read a write-only element", () => {
    const harness = open2004();
    harness.api.SetValue("cmi.session_time", "PT5M");
    expect(harness.api.GetValue("cmi.session_time")).toBe("");
    expect(harness.api.GetLastError()).toBe("404");
  });

  it("answers _children so content knows what it may write", () => {
    expect(open12().api.LMSGetValue("cmi.core.score._children")).toBe("raw,min,max");
    expect(open2004().api.GetValue("cmi.score._children")).toBe("scaled,raw,min,max");
  });

  it("derives _count from the indices content has written", () => {
    const harness = open2004();
    expect(harness.api.GetValue("cmi.interactions._count")).toBe("0");
    harness.api.SetValue("cmi.interactions.0.id", "q1");
    harness.api.SetValue("cmi.interactions.2.id", "q3");
    expect(harness.api.GetValue("cmi.interactions._count")).toBe("3");
  });

  it("counts an element name holding regex meta-characters without faltering", () => {
    // Matches the reader-side run-time: the name comes from the content, so treating it
    // as a pattern would throw and take the whole API down.
    const harness = open2004();
    expect(harness.api.GetValue("cmi.vendor(a|b)[._count")).toBe("0");
    harness.api.SetValue("cmi.vendor(a|b)[.1.id", "q2");
    expect(harness.api.GetValue("cmi.vendor(a|b)[._count")).toBe("2");
  });

  it("stores elements it has never heard of rather than rejecting them", () => {
    const harness = open2004();
    expect(harness.api.SetValue("cmi.vendor.private_state", "x=1")).toBe("true");
    expect(harness.api.GetValue("cmi.vendor.private_state")).toBe("x=1");
  });

  it("reports an empty string for an element that was never set", () => {
    const harness = open12();
    expect(harness.api.LMSGetValue("cmi.core.lesson_location")).toBe("");
    expect(harness.api.LMSGetLastError()).toBe("0");
  });
});

describe("buildLmsRuntimeScript: session lifecycle", () => {
  it("rejects a second initialise", () => {
    const harness = open12();
    expect(harness.api.LMSInitialize("")).toBe("false");
    expect(harness.api.LMSGetLastError()).toBe("101");
  });

  it("rejects reads and writes before initialise", () => {
    const harness = launch({ version: "1.2" });
    expect(harness.api.LMSGetValue("cmi.core.lesson_status")).toBe("");
    expect(harness.api.LMSGetLastError()).toBe("122");
    expect(harness.api.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("false");
    expect(harness.api.LMSGetLastError()).toBe("132");
  });

  it("rejects everything after terminate", () => {
    const harness = open12();
    expect(harness.api.LMSFinish("")).toBe("true");
    expect(harness.api.LMSFinish("")).toBe("false");
    expect(harness.api.LMSGetLastError()).toBe("301");
  });

  it("describes the error it last reported", () => {
    const harness = open12();
    harness.api.LMSSetValue("cmi.core.entry", "resume");
    expect(harness.api.LMSGetErrorString(harness.api.LMSGetLastError())).toBe("Element is read only");
  });
});

describe("buildLmsRuntimeScript: persistence and resume", () => {
  it("saves under a key shared with the reader's run-time", () => {
    const harness = open12({ courseId: "smoke", loId: "/scorm/smoke/topic-01/quiz" });
    harness.api.LMSSetValue("cmi.core.lesson_status", "completed");
    harness.api.LMSCommit("");
    expect([...harness.storage.keys()]).toEqual(["tutors-scorm:smoke:/scorm/smoke/topic-01/quiz"]);
  });

  it("restores a suspended attempt and tells the content to resume", () => {
    const storage = new Map<string, string>();
    const first = open12({}, storage);
    first.api.LMSSetValue("cmi.core.lesson_location", "question-4");
    first.api.LMSSetValue("cmi.suspend_data", "answers=3");
    first.api.LMSSetValue("cmi.core.exit", "suspend");
    first.api.LMSFinish("");

    const second = open12({}, storage);
    expect(second.api.LMSGetValue("cmi.core.entry")).toBe("resume");
    expect(second.api.LMSGetValue("cmi.core.lesson_location")).toBe("question-4");
    expect(second.api.LMSGetValue("cmi.suspend_data")).toBe("answers=3");
  });

  it("starts a fresh attempt when there is nothing to resume", () => {
    expect(open2004().api.GetValue("cmi.entry")).toBe("ab-initio");
  });

  it("accumulates total time across attempts", () => {
    const storage = new Map<string, string>();
    const first = open12({}, storage);
    first.api.LMSSetValue("cmi.core.session_time", "00:10:30.00");
    first.api.LMSFinish("");

    const second = open12({}, storage);
    expect(second.api.LMSGetValue("cmi.core.total_time")).toBe("00:10:30.00");
    second.api.LMSSetValue("cmi.core.session_time", "00:04:30.00");
    second.api.LMSFinish("");

    expect(open12({}, storage).api.LMSGetValue("cmi.core.total_time")).toBe("00:15:00.00");
  });

  it("accumulates total time in the 2004 duration format", () => {
    const storage = new Map<string, string>();
    const first = open2004({}, storage);
    first.api.SetValue("cmi.session_time", "PT1H2M3S");
    first.api.Terminate("");
    expect(open2004({}, storage).api.GetValue("cmi.total_time")).toBe("PT1H2M3S");
  });

  it("reads a session time reported in the other profile's format", () => {
    // Content in the wild is not consistent about this, and a misread total loses time.
    const storage = new Map<string, string>();
    const first = open2004({}, storage);
    first.api.SetValue("cmi.session_time", "00:01:30.00");
    first.api.Terminate("");
    expect(open2004({}, storage).api.GetValue("cmi.total_time")).toBe("PT1M30S");
  });

  it("saves the attempt when the learner navigates away without terminating", () => {
    const storage = new Map<string, string>();
    const harness = open12({}, storage);
    harness.api.LMSSetValue("cmi.core.lesson_location", "question-9");
    harness.pagehide();
    expect(open12({}, storage).api.LMSGetValue("cmi.core.lesson_location")).toBe("question-9");
  });

  it("keeps running when the browser denies storage", () => {
    const harness = launch({ version: "1.2", courseId: "smoke", loId: "quiz" }, new Map(), true);
    harness.api.LMSInitialize("");
    expect(harness.api.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("true");
    expect(harness.api.LMSCommit("")).toBe("true");
    expect(harness.api.LMSGetValue("cmi.core.lesson_status")).toBe("completed");
  });
});
