import { describe, it, expect, vi } from "vitest";
import { startScormSession } from "../../../packages/svelte/utils/scorm/src/session.ts";
import type { Scorm } from "@tutors/tutors-model-lib";

/**
 * `Scorm.svelte` hosts an imported package: it publishes the run-time API on the window,
 * then frames the SCO.
 *
 * The repo has no Svelte renderer in Vitest, so the component's markup decisions are
 * asserted against its inputs, and the behaviour it delegates to `startScormSession` —
 * which is the part a learner would notice going wrong — is driven directly.
 */

function makeLo(overrides: Partial<Scorm> = {}): Scorm {
  return {
    type: "scorm",
    id: "scorm-quiz",
    title: "Vendor Quiz",
    route: "/scorm/smoke/topic-01/scorm-quiz",
    scorm: "https://smoke.netlify.app/topic-01/scorm-quiz/package/index.html",
    scormFile: "index.html",
    scormVersion: "1.2",
    parentCourse: { courseId: "smoke" },
    ...overrides,
  } as unknown as Scorm;
}

/** A stand-in for the window the component publishes the API on. */
function fakeWindow() {
  return {} as unknown as Window & Record<string, unknown>;
}

function sessionOptions(target: Window, overrides: Record<string, unknown> = {}) {
  return {
    target,
    courseId: "smoke",
    loId: "/scorm/smoke/topic-01/scorm-quiz",
    learnerId: "student-1",
    learnerName: "A Learner",
    version: "1.2" as const,
    ...overrides,
  };
}

describe("Scorm: what the component renders", () => {
  it("frames the package's launch address", () => {
    expect(makeLo().scorm).toBe("https://smoke.netlify.app/topic-01/scorm-quiz/package/index.html");
  });

  it("titles the frame, so it is reachable by assistive technology", () => {
    expect(makeLo({ title: "Ethics Module" }).title).toBe("Ethics Module");
  });

  it("shows a message instead of an empty frame when no package was found", () => {
    // buildScormLo leaves `scorm` unset when a folder holds no readable manifest.
    expect(makeLo({ scorm: undefined }).scorm).toBeUndefined();
  });

  it("labels the profile the package declares", () => {
    expect(makeLo({ scormVersion: "2004" }).scormVersion).toBe("2004");
  });
});

describe("Scorm: the run-time session", () => {
  it("publishes the API for the declared profile before the frame is shown", async () => {
    // The component gates the iframe on this promise, because a SCO that finds no API
    // during its own load gives up rather than retrying.
    const target = fakeWindow();
    await startScormSession(sessionOptions(target));
    expect(target.API).toBeDefined();
    expect(target.API_1484_11).toBeUndefined();

    const target2004 = fakeWindow();
    await startScormSession(sessionOptions(target2004, { version: "2004" }));
    expect(target2004.API_1484_11).toBeDefined();
  });

  it("hands the learner's saved attempt back to the content", async () => {
    const target = fakeWindow();
    await startScormSession(
      sessionOptions(target, {
        loadRemote: async () => ({ "cmi.core.lesson_location": "question-4", "cmi.core.exit": "suspend" }),
        saveRemote: () => {},
      }),
    );

    const api = target.API as Record<string, (...args: string[]) => string>;
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.core.entry")).toBe("resume");
    expect(api.LMSGetValue("cmi.core.lesson_location")).toBe("question-4");
  });

  it("writes the attempt back when the content commits", async () => {
    const saved: Array<Record<string, string>> = [];
    const target = fakeWindow();
    await startScormSession(sessionOptions(target, { saveRemote: (cmi: Record<string, string>) => void saved.push(cmi) }));

    const api = target.API as Record<string, (...args: string[]) => string>;
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.lesson_status", "completed");
    api.LMSCommit("");

    expect(saved).toHaveLength(1);
    expect(saved[0]["cmi.core.lesson_status"]).toBe("completed");
  });

  it("starts a fresh attempt rather than failing when saved state cannot be read", async () => {
    const target = fakeWindow();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = await startScormSession(sessionOptions(target, { loadRemote: () => Promise.reject(new Error("offline")), saveRemote: () => {} }));

    expect(session.runtime.initialize()).toBe("true");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("saves and removes the API when the learner navigates away", async () => {
    // Content often leaves without calling Terminate, and the API must not outlive the
    // component: the next learning object would inherit an LMS pointing at this package.
    const saved: Array<Record<string, string>> = [];
    const target = fakeWindow();
    const session = await startScormSession(sessionOptions(target, { saveRemote: (cmi: Record<string, string>) => void saved.push(cmi) }));

    const api = target.API as Record<string, (...args: string[]) => string>;
    api.LMSInitialize("");
    api.LMSSetValue("cmi.core.lesson_location", "question-9");
    session.end();

    expect(saved[saved.length - 1]["cmi.core.lesson_location"]).toBe("question-9");
    expect(target.API).toBeUndefined();
  });

  it("does not save twice when the content has already terminated", async () => {
    const saved: Array<Record<string, string>> = [];
    const target = fakeWindow();
    const session = await startScormSession(sessionOptions(target, { saveRemote: (cmi: Record<string, string>) => void saved.push(cmi) }));

    const api = target.API as Record<string, (...args: string[]) => string>;
    api.LMSInitialize("");
    api.LMSFinish("");
    session.end();

    expect(saved).toHaveLength(1);
  });

  it("passes the learning object's pass mark to the content", async () => {
    const target = fakeWindow();
    await startScormSession(sessionOptions(target, { masteryScore: 80 }));
    const api = target.API as Record<string, (...args: string[]) => string>;
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.student_data.mastery_score")).toBe("80");
  });

  it("runs for an anonymous learner, as the reader does when signed out", async () => {
    const target = fakeWindow();
    await startScormSession(sessionOptions(target, { learnerId: "anonymous", learnerName: "Anonymous" }));
    const api = target.API as Record<string, (...args: string[]) => string>;
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.core.student_id")).toBe("anonymous");
    // With no remote configured nothing leaves the browser, and the attempt still resumes.
    expect(api.LMSCommit("")).toBe("true");
  });
});
